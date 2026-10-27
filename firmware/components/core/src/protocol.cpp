#include "core/protocol.hpp"

#include <cstdlib>
#include <memory>

#include "cJSON.h"

namespace core {

namespace {

struct JsonDeleter {
  void operator()(cJSON *json) const { cJSON_Delete(json); }
};
using Json = std::unique_ptr<cJSON, JsonDeleter>;

std::string print(const Json &json) {
  char *text = cJSON_PrintUnformatted(json.get());
  std::string result = text ? text : "";
  cJSON_free(text);
  return result;
}

void add_string(const Json &json, const char *key, std::string_view value) {
  cJSON_AddStringToObject(json.get(), key, std::string(value).c_str());
}

std::string string_field(const cJSON *object, const char *key) {
  const cJSON *item = cJSON_GetObjectItemCaseSensitive(object, key);
  return cJSON_IsString(item) ? item->valuestring : "";
}

}  // namespace

std::string encode_hello(std::string_view firmware_version) {
  Json json(cJSON_CreateObject());
  add_string(json, "type", "hello");
  add_string(json, "firmwareVersion", firmware_version);
  return print(json);
}

std::string encode_error(std::string_view code, std::string_view command_id,
                         std::string_view message) {
  Json json(cJSON_CreateObject());
  add_string(json, "type", "error");
  add_string(json, "code", code);
  add_string(json, "commandId", command_id);
  add_string(json, "message", message);
  return print(json);
}

std::optional<ServerMessage> decode_server_message(std::string_view text) {
  Json json(cJSON_ParseWithLength(text.data(), text.size()));
  if (!json || !cJSON_IsObject(json.get())) return std::nullopt;

  ServerMessage message;
  const std::string type = string_field(json.get(), "type");
  if (type == "readIr" || type == "sendIr") {
    message.command_id = string_field(json.get(), "commandId");
    if (!message.command_id.empty()) {
      message.type = type == "readIr" ? ServerMessage::Type::ReadIr
                                      : ServerMessage::Type::SendIr;
    }
  } else if (type == "error") {
    message.type = ServerMessage::Type::Error;
    message.code = string_field(json.get(), "code");
    message.message = string_field(json.get(), "message");
  }
  return message;
}

}  // namespace core
