#include "core/device.hpp"

#include "core/protocol.hpp"
#include "core/text.hpp"

namespace core {

namespace {

std::string seconds(uint32_t ms) { return std::to_string((ms + 999) / 1000) + " s"; }

int64_t minutes_left(int64_t ms) { return (ms + 59999) / 60000; }

}  // namespace

Device::Device(DeviceInfo info, Ports ports, Timing timing)
    : info_(std::move(info)), ports_(ports), timing_(timing) {}

bool Device::can_run() const { return info_.provisioned && info_.backend_configured; }

void Device::start() {
  if (!info_.provisioned) {
    ports_.console.print("not provisioned — run scripts/provision-device.sh");
    return;
  }
  if (!info_.backend_configured) {
    ports_.console.print("no backend address — write firmware/backend-url.txt and rebuild");
    return;
  }
  wifi_ = ports_.settings.load_wifi();
  if (!wifi_) {
    ports_.console.print("no Wi-Fi — type: wifi <ssid> <password>");
    return;
  }
  join_wifi();
}

void Device::on_line(std::string_view line) {
  const Command command = parse_command(line);
  switch (command.kind) {
    case Command::Kind::Invalid:
      if (!command.error.empty()) ports_.console.print(command.error);
      return;
    case Command::Kind::Help:
      for (const char *const *help = kHelpLines; *help; help++) ports_.console.print(*help);
      return;
    case Command::Kind::Status:
      print_status();
      return;
    case Command::Kind::Pair:
      pair();
      return;
    case Command::Kind::Wifi:
      break;
  }

  if (!can_run()) {
    ports_.console.print("this device can't connect yet — see status");
    return;
  }
  if (!ports_.settings.save_wifi(command.wifi)) {
    ports_.console.print("could not save the Wi-Fi details");
    return;
  }
  wifi_ = command.wifi;
  // Rejoining drops what was there; the link reopens once Wi-Fi is back.
  drop_link();
  wifi_up_ = false;
  wifi_attempt_ = 0;
  ports_.timers.cancel(TimerId::WifiRetry);
  join_wifi();
}

void Device::join_wifi() {
  ports_.console.print("joining Wi-Fi " + wifi_->ssid + " …");
  ports_.wifi.connect(*wifi_);
}

void Device::on_wifi_up() {
  wifi_up_ = true;
  wifi_attempt_ = 0;
  ports_.timers.cancel(TimerId::WifiRetry);
  ports_.console.print("Wi-Fi connected");
  open_link();
}

void Device::on_wifi_down() {
  wifi_up_ = false;
  drop_link();
  if (!wifi_) return;
  const uint32_t ms = next_backoff(wifi_attempt_);
  ports_.console.print("Wi-Fi unavailable — retrying in " + seconds(ms));
  ports_.timers.schedule(TimerId::WifiRetry, ms);
}

void Device::open_link() {
  backend_ = Backend::Connecting;
  ports_.link.open();
}

void Device::drop_link() {
  ports_.timers.cancel(TimerId::LinkRetry);
  if (backend_ == Backend::Connected || backend_ == Backend::Connecting) ports_.link.close();
  backend_ = Backend::Offline;
}

void Device::retry_link(uint32_t ms) { ports_.timers.schedule(TimerId::LinkRetry, ms); }

uint32_t Device::next_backoff(unsigned &attempt) const {
  constexpr unsigned kSteps = sizeof(timing_.backoff_ms) / sizeof(timing_.backoff_ms[0]);
  const uint32_t ms = timing_.backoff_ms[attempt < kSteps ? attempt : kSteps - 1];
  attempt++;
  return ms;
}

void Device::on_link_opened() {
  backend_ = Backend::Connected;
  link_attempt_ = 0;
  announced_not_enrolled_ = false;
  code_.reset();
  ports_.timers.cancel(TimerId::LinkRetry);
  ports_.timers.cancel(TimerId::PairingExpiry);
  ports_.link.send(encode_hello(info_.firmware_version));
  ports_.console.print("connected");
}

void Device::on_link_refused(int http_status) {
  if (http_status != 403) {
    on_link_failed();
    return;
  }
  backend_ = Backend::NotEnrolled;
  if (!announced_not_enrolled_) {
    ports_.console.print("not enrolled — type: pair");
    announced_not_enrolled_ = true;
  }
  if (wifi_up_) retry_link(code_ ? timing_.pairing_retry_ms : timing_.not_enrolled_retry_ms);
}

void Device::on_link_failed() {
  backend_ = Backend::Offline;
  if (!wifi_up_) return;
  const uint32_t ms = next_backoff(link_attempt_);
  ports_.console.print("backend unreachable — retrying in " + seconds(ms));
  retry_link(ms);
}

void Device::on_link_closed() {
  const bool was_connected = backend_ == Backend::Connected;
  backend_ = Backend::Offline;
  if (!wifi_up_) return;
  const uint32_t ms = next_backoff(link_attempt_);
  ports_.console.print(std::string(was_connected ? "disconnected" : "backend closed the link") +
                       " — retrying in " + seconds(ms));
  retry_link(ms);
}

void Device::on_link_message(std::string_view text) {
  if (backend_ != Backend::Connected) return;
  const auto message = decode_server_message(text);
  if (!message) {
    ports_.console.print("ignored a frame that is not a JSON object");
    return;
  }
  switch (message->type) {
    case ServerMessage::Type::ReadIr:
    case ServerMessage::Type::SendIr:
      ports_.link.send(encode_error("INVALID_COMMAND", message->command_id,
                                    "IR is not supported yet"));
      return;
    case ServerMessage::Type::Error:
      ports_.console.print("server error " + message->code + ": " + message->message);
      return;
    case ServerMessage::Type::Unknown:
      ports_.console.print("ignored an unknown message");
      return;
  }
}

void Device::pair() {
  if (!can_run()) {
    ports_.console.print("this device can't connect yet — see status");
  } else if (backend_ == Backend::Connected) {
    ports_.console.print("already connected");
  } else if (!wifi_up_) {
    ports_.console.print("no Wi-Fi yet — type: wifi <ssid> <password>");
  } else if (requesting_code_) {
    ports_.console.print("already asking for a code");
  } else {
    requesting_code_ = true;
    ports_.console.print("asking for a pairing code …");
    ports_.pairing.request();
  }
}

void Device::on_pairing_code(std::string_view code, int64_t lifetime_ms) {
  requesting_code_ = false;
  if (lifetime_ms <= 0) {
    ports_.console.print("pairing code expired — type: pair");
    return;
  }
  code_ = std::string(code);
  code_deadline_ms_ = ports_.timers.now_ms() + lifetime_ms;
  ports_.console.print("pairing code: " + group_pairing_code(code) + " (expires in " +
                       std::to_string(minutes_left(lifetime_ms)) + " min)");
  ports_.timers.schedule(TimerId::PairingExpiry, static_cast<uint32_t>(lifetime_ms));
  if (wifi_up_ && backend_ != Backend::Connected && backend_ != Backend::Connecting) {
    retry_link(timing_.pairing_retry_ms);
  }
}

void Device::on_pairing_failed(std::string_view reason) {
  requesting_code_ = false;
  ports_.console.print("could not get a pairing code: " + std::string(reason));
}

void Device::on_timer(TimerId id) {
  switch (id) {
    case TimerId::WifiRetry:
      if (wifi_ && !wifi_up_) join_wifi();
      return;
    case TimerId::LinkRetry:
      if (wifi_up_ && backend_ != Backend::Connected && backend_ != Backend::Connecting) {
        open_link();
      }
      return;
    case TimerId::PairingExpiry:
      if (!code_) return;
      code_.reset();
      ports_.console.print("pairing code expired — type: pair");
      if (backend_ == Backend::NotEnrolled && wifi_up_) retry_link(timing_.not_enrolled_retry_ms);
      return;
  }
}

std::string Device::backend_state() const {
  if (!info_.backend_configured) return "not configured";
  switch (backend_) {
    case Backend::Offline: return "offline";
    case Backend::Connecting: return "connecting";
    case Backend::Connected: return "connected";
    case Backend::NotEnrolled: return "not enrolled";
  }
  return "offline";
}

void Device::print_status() {
  ports_.console.print("firmware   " + info_.firmware_version);
  ports_.console.print("MAC        " + info_.mac);
  ports_.console.print(std::string("identity   ") + (info_.provisioned ? "provisioned" : "missing"));
  ports_.console.print("Wi-Fi      " + (wifi_ ? wifi_->ssid + (wifi_up_ ? " (connected)" : " (connecting)")
                                            : std::string("not set")));
  ports_.console.print("backend    " + backend_state());
  if (code_) {
    const int64_t left = code_deadline_ms_ - ports_.timers.now_ms();
    ports_.console.print("pairing    " + group_pairing_code(*code_) + " (" +
                         std::to_string(minutes_left(left)) + " min left)");
  } else {
    ports_.console.print("pairing    none");
  }
}

}  // namespace core
