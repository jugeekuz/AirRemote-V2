// The firmware as a Linux program. Configured by environment variables:
//   AIRREMOTE_BACKEND_URL            the device listener, e.g. https://127.0.0.1:8443
//   AIRREMOTE_CA_FILE                the CA that signed its certificate (PEM)
//   AIRREMOTE_CERT_FILE / _KEY_FILE  the device's identity (PEM); absent: not provisioned
//   AIRREMOTE_MAC                    what status shows
//   AIRREMOTE_NOT_ENROLLED_RETRY_MS  shortens the retry after a 403, for tests
//   AIRREMOTE_IR_FILE                where the stand-in IR receiver looks for codes
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <optional>
#include <sstream>
#include <string>

#include <unistd.h>

#include "connection/pairing_api.hpp"
#include "connection/websocket_link.hpp"
#include "core/device.hpp"
#include "core/text.hpp"
#include "esp_event.h"
#include "file_ir_receiver.hpp"
#include "psa/crypto.h"
#include "runtime/console.hpp"
#include "runtime/event_queue.hpp"
#include "runtime/timers.hpp"

// esp_timer has no Linux implementation; the network clients only need a
// monotonic clock.
extern "C" int64_t esp_timer_get_time(void) {
  timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);
  return static_cast<int64_t>(now.tv_sec) * 1000000 + now.tv_nsec / 1000;
}

namespace {

std::string env(const char *name) {
  const char *value = getenv(name);
  return value ? value : "";
}

std::optional<std::string> read_file(const std::string &path) {
  if (path.empty()) return std::nullopt;
  std::ifstream file(path);
  if (!file) return std::nullopt;
  std::stringstream text;
  text << file.rdbuf();
  return text.str();
}

// Wi-Fi is always there: joining succeeds at once.
class LinuxWifi : public core::Wifi {
 public:
  explicit LinuxWifi(runtime::EventQueue &queue) : queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }
  void connect(const core::WifiCredentials &) override {
    core::Device *device = device_;
    queue_.post([device] { device->on_wifi_up(); });
  }

 private:
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
};

class MemorySettings : public core::Settings {
 public:
  std::optional<core::WifiCredentials> load_wifi() override { return wifi_; }
  bool save_wifi(const core::WifiCredentials &credentials) override {
    wifi_ = credentials;
    return true;
  }

 private:
  std::optional<core::WifiCredentials> wifi_;
};

}  // namespace

extern "C" void app_main(void) {
  // On the chip, startup code does this; mbedTLS can't parse EC keys without it.
  psa_crypto_init();
  esp_event_loop_create_default();

  const auto urls = core::backend_urls(env("AIRREMOTE_BACKEND_URL"));
  const auto ca = read_file(env("AIRREMOTE_CA_FILE"));
  const auto cert = read_file(env("AIRREMOTE_CERT_FILE"));
  const auto key = read_file(env("AIRREMOTE_KEY_FILE"));
  static connection::TlsMaterial tls{ca.value_or(""), cert.value_or(""), key.value_or("")};

  core::Timing timing;
  if (const std::string retry = env("AIRREMOTE_NOT_ENROLLED_RETRY_MS"); !retry.empty()) {
    timing.not_enrolled_retry_ms = static_cast<uint32_t>(std::stoul(retry));
  }

  static runtime::EventQueue queue;
  static runtime::StdoutConsole console;
  static LinuxWifi wifi(queue);
  static MemorySettings settings;
  static connection::WebSocketLink link(urls ? urls->websocket : "", tls, queue);
  static connection::HttpPairingApi pairing(urls ? urls->pairing : "", tls, queue);
  static runtime::FreeRtosTimers timers(queue);
  static FileIrReceiver ir(env("AIRREMOTE_IR_FILE"), queue);

  static core::Device device(
      core::DeviceInfo{AIRREMOTE_FIRMWARE_VERSION, env("AIRREMOTE_MAC"),
                       cert.has_value() && key.has_value(), urls.has_value() && ca.has_value()},
      core::Ports{console, wifi, settings, link, pairing, timers, ir}, timing);
  wifi.attach(device);
  link.attach(device);
  pairing.attach(device);
  timers.attach(device);
  ir.attach(device);

  queue.post([] { device.start(); });
  runtime::start_console_reader(queue, device, isatty(fileno(stdin)) != 0);
  queue.run();
}
