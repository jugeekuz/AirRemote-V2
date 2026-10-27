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

TEST_CASE("decodes a pairing response's code and expiry", "[protocol]") {
  auto pairing = core::decode_pairing_response(
      R"({"pairingCode":"7K4MQ9TX","expiresAt":"2026-10-27T12:15:00.000Z"})");
  TEST_ASSERT_TRUE(pairing.has_value());
  TEST_ASSERT_EQUAL_STRING("7K4MQ9TX", pairing->code.c_str());
  TEST_ASSERT_EQUAL_STRING("2026-10-27T12:15:00.000Z", pairing->expires_at.c_str());
  TEST_ASSERT_FALSE(core::decode_pairing_response(R"({"pairingCode":"7K4MQ9TX"})").has_value());
  TEST_ASSERT_FALSE(core::decode_pairing_response(R"({"pairingCode":7})").has_value());
  TEST_ASSERT_FALSE(core::decode_pairing_response("nope").has_value());
}

TEST_CASE("encode_read_ir_result gives the read result frame", "[protocol]") {
  TEST_ASSERT_EQUAL_STRING(
      R"({"type":"readIrResult","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[9000,4500,560]})",
      core::encode_read_ir_result(kCommandId, {9000, 4500, 560}).c_str());
}

TEST_CASE("decodes readIr's timeoutMs", "[protocol]") {
  auto read = core::decode_server_message(
      R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":15000})");
  TEST_ASSERT_EQUAL_UINT32(15000, read->timeout_ms);
}

TEST_CASE("readIr's timeoutMs is clamped to the contract's 1-60 s", "[protocol]") {
  auto big = core::decode_server_message(
      R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":1e15})");
  TEST_ASSERT_EQUAL_UINT32(60000, big->timeout_ms);
  auto small = core::decode_server_message(
      R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":0.5})");
  TEST_ASSERT_EQUAL_UINT32(1000, small->timeout_ms);
}

TEST_CASE("decodes sendIr's timings, and flags garbage timings", "[protocol]") {
  auto send = core::decode_server_message(
      R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[9000,4500,0,560]})");
  TEST_ASSERT_TRUE(send->type == ServerMessage::Type::SendIr);
  TEST_ASSERT_TRUE(send->timings == (std::vector<uint16_t>{9000, 4500, 0, 560}));
  TEST_ASSERT_TRUE(send->timings_valid);
  for (const char *bad :
       {R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[-1]})",
        R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[70000]})",
        R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":"x"})",
        R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[]})",
        R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11"})"}) {
    // Still a sendIr to answer (its id is known), but with nothing to send.
    auto message = core::decode_server_message(bad);
    TEST_ASSERT_TRUE_MESSAGE(message->type == ServerMessage::Type::SendIr, bad);
    TEST_ASSERT_TRUE_MESSAGE(message->timings.empty(), bad);
    TEST_ASSERT_FALSE_MESSAGE(message->timings_valid, bad);
  }
}

TEST_CASE("encode_send_ir_result gives the send result frame", "[protocol]") {
  TEST_ASSERT_EQUAL_STRING(
      R"({"type":"sendIrResult","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11"})",
      core::encode_send_ir_result(kCommandId).c_str());
}
