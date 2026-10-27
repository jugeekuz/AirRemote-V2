#include "board/settings.hpp"

#include <string>

#include "nvs.h"

namespace board {

namespace {

constexpr const char *kNamespace = "wifi";

std::optional<std::string> get_string(nvs_handle_t handle, const char *key) {
  size_t size = 0;
  if (nvs_get_str(handle, key, nullptr, &size) != ESP_OK || size == 0) return std::nullopt;
  std::string value(size, '\0');
  if (nvs_get_str(handle, key, value.data(), &size) != ESP_OK) return std::nullopt;
  value.resize(size - 1);  // drop the terminator
  return value;
}

}  // namespace

std::optional<core::WifiCredentials> NvsSettings::load_wifi() {
  nvs_handle_t handle;
  if (nvs_open(kNamespace, NVS_READONLY, &handle) != ESP_OK) return std::nullopt;
  auto ssid = get_string(handle, "ssid");
  auto password = get_string(handle, "password");
  nvs_close(handle);
  if (!ssid) return std::nullopt;
  return core::WifiCredentials{*ssid, password.value_or("")};
}

bool NvsSettings::save_wifi(const core::WifiCredentials &credentials) {
  nvs_handle_t handle;
  if (nvs_open(kNamespace, NVS_READWRITE, &handle) != ESP_OK) return false;
  const bool saved = nvs_set_str(handle, "ssid", credentials.ssid.c_str()) == ESP_OK &&
                     nvs_set_str(handle, "password", credentials.password.c_str()) == ESP_OK &&
                     nvs_commit(handle) == ESP_OK;
  nvs_close(handle);
  return saved;
}

}  // namespace board
