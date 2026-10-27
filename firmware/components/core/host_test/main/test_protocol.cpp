#include <unity.h>

#include "core/protocol.hpp"

using core::ServerMessage;

static const char *kCommandId = "6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11";

TEST_CASE("encode_hello gives the hello frame", "[protocol]") {
  TEST_ASSERT_EQUAL_STRING(R"({"type":"hello","firmwareVersion":"0.1.0"})",
                           core::encode_hello("0.1.0").c_str());
}

TEST_CASE("encode_error gives an error answering a command", "[protocol]") {
  TEST_ASSERT_EQUAL_STRING(
      R"({"type":"error","code":"INVALID_COMMAND","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","message":"IR is not supported yet"})",
      core::encode_error("INVALID_COMMAND", kCommandId, "IR is not supported yet").c_str());
}

TEST_CASE("decodes readIr and sendIr with their command id", "[protocol]") {
  auto read = core::decode_server_message(
      R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":1000})");
  TEST_ASSERT_TRUE(read.has_value());
  TEST_ASSERT_TRUE(read->type == ServerMessage::Type::ReadIr);
  TEST_ASSERT_EQUAL_STRING(kCommandId, read->command_id.c_str());

  auto send = core::decode_server_message(
      R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[9000,4500]})");
  TEST_ASSERT_TRUE(send.has_value());
  TEST_ASSERT_TRUE(send->type == ServerMessage::Type::SendIr);
  TEST_ASSERT_EQUAL_STRING(kCommandId, send->command_id.c_str());
}

TEST_CASE("decodes the server's error with its code and message", "[protocol]") {
  auto error = core::decode_server_message(
      R"({"type":"error","code":"INVALID_MESSAGE","message":"type: Invalid input"})");
  TEST_ASSERT_TRUE(error.has_value());
  TEST_ASSERT_TRUE(error->type == ServerMessage::Type::Error);
  TEST_ASSERT_EQUAL_STRING("INVALID_MESSAGE", error->code.c_str());
  TEST_ASSERT_EQUAL_STRING("type: Invalid input", error->message.c_str());
}

TEST_CASE("an unknown type, or a command without an id, is Unknown", "[protocol]") {
  TEST_ASSERT_TRUE(core::decode_server_message(R"({"type":"x"})")->type ==
                   ServerMessage::Type::Unknown);
  TEST_ASSERT_TRUE(core::decode_server_message(R"({"type":"readIr","timeoutMs":1000})")->type ==
                   ServerMessage::Type::Unknown);
  TEST_ASSERT_TRUE(core::decode_server_message(R"({"commandId":"x"})")->type ==
                   ServerMessage::Type::Unknown);
}

TEST_CASE("text that is not a JSON object decodes to nothing", "[protocol]") {
  TEST_ASSERT_FALSE(core::decode_server_message("{nope").has_value());
  TEST_ASSERT_FALSE(core::decode_server_message("[]").has_value());
  TEST_ASSERT_FALSE(core::decode_server_message(R"("str")").has_value());
  TEST_ASSERT_FALSE(core::decode_server_message("").has_value());
}
