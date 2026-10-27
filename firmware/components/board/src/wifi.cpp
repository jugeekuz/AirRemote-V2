#include "board/wifi.hpp"

#include <cstring>

#include "esp_netif.h"
#include "esp_wifi.h"

namespace board {

void EspWifi::start() {
  esp_netif_create_default_wifi_sta();
  wifi_init_config_t config = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&config));
  // Credentials live in the nvs partition through Settings, not the driver's copy.
  ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &EspWifi::on_event, this));
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &EspWifi::on_event, this));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_start());
}

void EspWifi::connect(const core::WifiCredentials &credentials) {
  if (associated_) {
    switching_ = true;
    esp_wifi_disconnect();
  }
  wifi_config_t config = {};
  strncpy(reinterpret_cast<char *>(config.sta.ssid), credentials.ssid.c_str(),
          sizeof(config.sta.ssid));
  strncpy(reinterpret_cast<char *>(config.sta.password), credentials.password.c_str(),
          sizeof(config.sta.password));
  config.sta.threshold.authmode = credentials.password.empty() ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;
  config.sta.pmf_cfg.capable = true;
  esp_wifi_set_config(WIFI_IF_STA, &config);
  if (esp_wifi_connect() != ESP_OK) {
    core::Device *device = device_;
    queue_.post([device] { device->on_wifi_down(); });
  }
}

// On the default event loop's task: hand everything to Device's task.
void EspWifi::on_event(void *self, esp_event_base_t base, int32_t id, void *) {
  auto *wifi = static_cast<EspWifi *>(self);
  core::Device *device = wifi->device_;
  if (!device) return;
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_CONNECTED) {
    wifi->associated_ = true;
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    wifi->associated_ = false;
    if (wifi->switching_) {
      wifi->switching_ = false;
      return;
    }
    wifi->queue_.post([device] { device->on_wifi_down(); });
  } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    wifi->queue_.post([device] { device->on_wifi_up(); });
  }
}

}  // namespace board
