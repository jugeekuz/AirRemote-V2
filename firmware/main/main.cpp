#include <cstdio>
#include <string>

#include "board/identity.hpp"
#include "board/ir_receiver.hpp"
#include "board/settings.hpp"
#include "board/wifi.hpp"
#include "connection/pairing_api.hpp"
#include "connection/websocket_link.hpp"
#include "core/device.hpp"
#include "core/text.hpp"
#include "driver/uart.h"
#include "driver/uart_vfs.h"
#include "esp_app_desc.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_ota_ops.h"
#include "nvs_flash.h"
#include "runtime/console.hpp"
#include "runtime/event_queue.hpp"
#include "runtime/timers.hpp"

extern const char server_ca_start[] asm("_binary_device_ca_crt_start");

namespace {

// Until the transmitter is wired in, every send fails.
class NoIrSender : public core::IrSender {
 public:
  explicit NoIrSender(runtime::EventQueue &queue) : queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }
  void send(std::vector<core::IrSymbol>) override {
    core::Device *device = device_;
    queue_.post([device] { device->on_ir_sent(false); });
  }

 private:
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
};

// Settings only: unlike identity, nvs may be wiped when its layout is stale.
void init_settings_storage() {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
  }
  ESP_ERROR_CHECK(err);
}

constexpr auto kConsoleUart = static_cast<uart_port_t>(CONFIG_ESP_CONSOLE_UART_NUM);

// The console on the UART, with a driver so reads block instead of failing.
void init_console() {
  fflush(stdout);
  setvbuf(stdin, nullptr, _IONBF, 0);
  uart_vfs_dev_port_set_rx_line_endings(kConsoleUart, ESP_LINE_ENDINGS_CR);
  uart_vfs_dev_port_set_tx_line_endings(kConsoleUart, ESP_LINE_ENDINGS_CRLF);
  ESP_ERROR_CHECK(uart_driver_install(kConsoleUart, 256, 0, 0, nullptr, 0));
  uart_vfs_dev_use_driver(kConsoleUart);
}

std::string mac_address() {
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char text[18];
  snprintf(text, sizeof(text), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3],
           mac[4], mac[5]);
  return text;
}

}  // namespace

extern "C" void app_main(void) {
  ESP_LOGI("airremote", "AirRemote firmware %s", esp_app_get_description()->version);
  init_settings_storage();
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  init_console();

  const auto identity = board::read_identity();
  const auto urls = core::backend_urls(AIRREMOTE_BACKEND_URL);
  static connection::TlsMaterial tls{server_ca_start, identity ? identity->cert : "",
                                     identity ? identity->key : ""};

  static runtime::EventQueue queue;
  static runtime::StdoutConsole console;
  static board::EspWifi wifi(queue);
  static board::NvsSettings settings;
  static connection::WebSocketLink link(urls ? urls->websocket : "", tls, queue);
  static connection::HttpPairingApi pairing(urls ? urls->pairing : "", tls, queue);
  static runtime::FreeRtosTimers timers(queue);
  // The TSOP38238's output, as on V1's board.
  static board::RmtIrReceiver ir(GPIO_NUM_2, queue);
  static NoIrSender ir_sender(queue);
  static core::Device device(
      core::DeviceInfo{esp_app_get_description()->version, mac_address(), identity.has_value(),
                       urls.has_value()},
      core::Ports{console, wifi, settings, link, pairing, timers, ir, ir_sender});
  wifi.attach(device);
  link.attach(device);
  pairing.attach(device);
  timers.attach(device);
  ir.attach(device);
  ir_sender.attach(device);
  ir.init();
  wifi.start();

  // Keeps this image after an OTA update. Move it to after the device has
  // reached the backend once OTA exists.
  ESP_ERROR_CHECK(esp_ota_mark_app_valid_cancel_rollback());

  queue.post([] { device.start(); });
  runtime::start_console_reader(queue, device, true);
  queue.run();
}
