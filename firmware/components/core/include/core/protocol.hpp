#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace core {

// The device protocol of @airremote/contracts (device-protocol): the frames
// this firmware sends, and what it needs from the ones it receives.

std::string encode_hello(std::string_view firmware_version);
// An error answering the command `command_id`.
std::string encode_error(std::string_view code, std::string_view command_id,
                         std::string_view message);
// The device transmitted the code of sendIr `command_id`.
std::string encode_send_ir_result(std::string_view command_id);
// The code a device read, answering readIr `command_id`.
std::string encode_read_ir_result(std::string_view command_id,
                                  const std::vector<uint16_t> &timings);

struct ServerMessage {
  enum class Type { ReadIr, SendIr, Error, Unknown };
  Type type = Type::Unknown;
  std::string command_id;     // ReadIr, SendIr
  uint32_t timeout_ms = 0;    // ReadIr
  std::vector<uint16_t> timings;  // SendIr
  std::string code, message;  // Error
};

// nullopt when the text is not a JSON object. A command without a commandId
// is Unknown: there is nothing to answer.
std::optional<ServerMessage> decode_server_message(std::string_view text);

// The body of a 201 from POST /pairing-code.
struct PairingResponse {
  std::string code;
  std::string expires_at;  // ISO 8601, UTC
};
std::optional<PairingResponse> decode_pairing_response(std::string_view body);

}  // namespace core
