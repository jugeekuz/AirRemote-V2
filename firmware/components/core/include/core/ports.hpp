#pragma once

#include <cstdint>
#include <optional>
#include <string_view>

#include "core/commands.hpp"

namespace core {

// What Device drives. The board and the Linux build implement these; tests
// fake them. Results come back as calls on Device (see device.hpp), always
// from the one task that runs Device.

struct Console {
  virtual ~Console() = default;
  virtual void print(std::string_view line) = 0;
};

// Reports back with Device::on_wifi_up / on_wifi_down.
struct Wifi {
  virtual ~Wifi() = default;
  virtual void connect(const WifiCredentials &credentials) = 0;
};

struct Settings {
  virtual ~Settings() = default;
  virtual std::optional<WifiCredentials> load_wifi() = 0;
  virtual bool save_wifi(const WifiCredentials &credentials) = 0;
};

// The WebSocket to the device listener. Reports back with on_link_opened,
// on_link_refused (an HTTP status for the upgrade), on_link_failed,
// on_link_closed and on_link_message.
struct Link {
  virtual ~Link() = default;
  virtual void open() = 0;
  virtual void send(std::string_view text) = 0;
  virtual void close() = 0;
};

// POST /pairing-code. Reports back with on_pairing_code or on_pairing_failed.
struct PairingApi {
  virtual ~PairingApi() = default;
  virtual void request() = 0;
};

enum class TimerId { WifiRetry, LinkRetry, PairingExpiry };

// One-shot timers that call Device::on_timer. Scheduling an id that is already
// scheduled replaces it.
struct Timers {
  virtual ~Timers() = default;
  virtual int64_t now_ms() = 0;
  virtual void schedule(TimerId id, uint32_t ms) = 0;
  virtual void cancel(TimerId id) = 0;
};

}  // namespace core
