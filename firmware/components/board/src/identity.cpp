#include "board/identity.hpp"

#include "nvs.h"
#include "nvs_flash.h"

namespace board {

namespace {

constexpr const char *kPartition = "identity";
constexpr const char *kNamespace = "identity";

std::optional<std::string> get_string(nvs_handle_t handle, const char *key) {
  size_t size = 0;
  if (nvs_get_str(handle, key, nullptr, &size) != ESP_OK || size <= 1) return std::nullopt;
  std::string value(size, '\0');
  if (nvs_get_str(handle, key, value.data(), &size) != ESP_OK) return std::nullopt;
  value.resize(size - 1);
  return value;
}

}  // namespace

std::optional<Identity> read_identity() {
  // Unlike nvs, never erased on NO_FREE_PAGES / NEW_VERSION_FOUND: that would
  // destroy the only copy of the key.
  if (nvs_flash_init_partition(kPartition) != ESP_OK) return std::nullopt;
  nvs_handle_t handle;
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READONLY, &handle) != ESP_OK) {
    return std::nullopt;
  }
  auto cert = get_string(handle, "cert");
  auto key = get_string(handle, "key");
  nvs_close(handle);
  if (!cert || !key) return std::nullopt;
  return Identity{*cert, *key};
}

}  // namespace board
