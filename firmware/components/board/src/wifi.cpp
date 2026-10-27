#include "board/wifi.hpp"

#include <cstring>

#include "esp_netif.h"
#include "esp_wifi.h"

namespace board {

namespace {

// Why the station is off the network, in a few words.
const char *reason_text(uint8_t reason) {
  switch (reason) {
    case WIFI_REASON_NO_AP_FOUND:
    case WIFI_REASON_NO_AP_FOUND_W_COMPATIBLE_SECURITY:
    case WIFI_REASON_NO_AP_FOUND_IN_AUTHMODE_THRESHOLD:
    case WIFI_REASON_NO_AP_FOUND_IN_RSSI_THRESHOLD:
      return "network not found";
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
      return "wrong password?";
    case WIFI_REASON_AUTH_EXPIRE:
      return "the router did not answer";
    case WIFI_REASON_BEACON_TIMEOUT:
      return "signal lost";
    default:
      return "";
  }
}

}  // namespace

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
  // Leaving the old network reports ASSOC_LEAVE, which on_event ignores.
  esp_wifi_disconnect();
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
    queue_.post([device] { device->on_wifi_down("could not start joining"); });
  }
}

// On the default event loop's task: hand everything to Device's task.
void EspWifi::on_event(void *self, esp_event_base_t base, int32_t id, void *data) {
  auto *wifi = static_cast<EspWifi *>(self);
  core::Device *device = wifi->device_;
  if (!device) return;
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    // Our own esp_wifi_disconnect() in connect(): not news, a join follows.
    const auto *event = static_cast<wifi_event_sta_disconnected_t *>(data);
    if (event && event->reason == WIFI_REASON_ASSOC_LEAVE) return;
    const char *why = event ? reason_text(event->reason) : "";
    wifi->queue_.post([device, why] { device->on_wifi_down(why); });
  } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    wifi->queue_.post([device] { device->on_wifi_up(); });
  }
}

}  // namespace board
