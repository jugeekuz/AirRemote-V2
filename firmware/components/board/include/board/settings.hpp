#pragma once

#include "core/device.hpp"

namespace board {

// core::Settings in the nvs partition, namespace "wifi", keys ssid and password.
// A factory reset wipes them; the identity partition is separate.
class NvsSettings : public core::Settings {
 public:
  std::optional<core::WifiCredentials> load_wifi() override;
  bool save_wifi(const core::WifiCredentials &credentials) override;
};

}  // namespace board
