#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

#include "core/ir_capture.hpp"
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
  std::string backend_url;  // as built in (https://host:port), or empty
};

struct Ports {
  Console &console;
  Wifi &wifi;
  Settings &settings;
  Link &link;
  PairingApi &pairing;
  Timers &timers;
  IrReceiver &ir;
  IrSender &ir_sender;
};

// The code `ir selftest` sends: NEC-shaped, 67 timings.
const std::vector<uint16_t> &ir_self_test_code();

// Everything the device decides: joining Wi-Fi, keeping the link to the
// backend open, pairing on request, answering the server. Not thread-safe:
// every call must come from the same task.
class Device {
 public:
  Device(DeviceInfo info, Ports ports, Timing timing = {});

  void start();
  void on_line(std::string_view line);

  void on_wifi_up();
  // `reason`: why, in a few words, when the driver knows.
  void on_wifi_down(std::string_view reason = {});

  void on_link_opened();
  void on_link_refused(int http_status);
  void on_link_failed(std::string_view reason = {});
  void on_link_closed();
  void on_link_message(std::string_view text);

  void on_pairing_code(std::string_view code, int64_t lifetime_ms);
  void on_pairing_failed(std::string_view reason);

  // A stretch of IR the receiver captured; ignored unless reading.
  void on_ir_part(IrPart part);
  // The transmitter finished the code it was given.
  void on_ir_sent(bool ok);

  void on_timer(TimerId id);

 private:
  // One IR read at a time: for a backend readIr, or the console's ir.
  struct Read {
    enum class For { Backend, Console, SelfTest };
    For who;
    std::string command_id;  // For::Backend
    IrCapture capture;
    bool deadline_passed = false;
    int64_t started_at_us = 0;  // parts that ended earlier are stale
    int64_t give_up_at_us = 0;  // set when the deadline passes
  };

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
  void start_read(Read::For who, std::string command_id, uint32_t timeout_ms);
  void finish_code();
  void wait_for_silence();
  void end_read();
  void read_timed_out();
  bool ir_busy() const { return read_.has_value() || send_.has_value(); }
  void self_test_result(const IrCapture::Result &result);

  DeviceInfo info_;
  bool backend_configured_ = false;
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

  std::optional<Read> read_;

  // The code being transmitted: for a backend sendIr, or the self-test.
  struct Send {
    std::string command_id;  // empty for the self-test
    bool reply = true;       // false once the link closed
  };
  std::optional<Send> send_;
};

}  // namespace core
