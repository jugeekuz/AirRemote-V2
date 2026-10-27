#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

#include "core/ports.hpp"

namespace core {

struct Timing {
  // Wi-Fi and link retries; the last value repeats.
  uint32_t backoff_ms[6] = {1000, 2000, 4000, 8000, 16000, 30000};
  // After a 403, which also means "couldn't check" while the backend restarts.
  uint32_t not_enrolled_retry_ms = 30000;
  // While a pairing code is live, so enrolling connects within seconds.
  uint32_t pairing_retry_ms = 5000;
};

struct DeviceInfo {
  std::string firmware_version;
  std::string mac;
  bool provisioned;         // the identity partition holds a key and certificate
  bool backend_configured;  // a backend address was built in
};

struct Ports {
  Console &console;
  Wifi &wifi;
  Settings &settings;
  Link &link;
  PairingApi &pairing;
  Timers &timers;
};

// Everything the device decides: joining Wi-Fi, keeping the link to the
// backend open, pairing on request, answering the server. Not thread-safe:
// every call must come from the same task.
class Device {
 public:
  Device(DeviceInfo info, Ports ports, Timing timing = {});

  void start();
  void on_line(std::string_view line);

  void on_wifi_up();
  void on_wifi_down();

  void on_link_opened();
  void on_link_refused(int http_status);
  void on_link_failed();
  void on_link_closed();
  void on_link_message(std::string_view text);

  void on_pairing_code(std::string_view code, int64_t lifetime_ms);
  void on_pairing_failed(std::string_view reason);

  void on_timer(TimerId id);

 private:
  enum class Backend { Offline, Connecting, Connected, NotEnrolled };

  bool can_run() const;
  void join_wifi();
  void open_link();
  void drop_link();
  void retry_link(uint32_t ms);
  uint32_t next_backoff(unsigned &attempt) const;
  void pair();
  void print_status();
  std::string backend_state() const;

  DeviceInfo info_;
  Ports ports_;
  Timing timing_;

  std::optional<WifiCredentials> wifi_;
  bool wifi_up_ = false;
  unsigned wifi_attempt_ = 0;

  Backend backend_ = Backend::Offline;
  unsigned link_attempt_ = 0;
  bool announced_not_enrolled_ = false;

  bool requesting_code_ = false;
  std::optional<std::string> code_;
  int64_t code_deadline_ms_ = 0;
};

}  // namespace core
