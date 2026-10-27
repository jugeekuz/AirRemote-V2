#include "core/device.hpp"

#include "core/protocol.hpp"
#include "core/text.hpp"

namespace core {

namespace {

std::string seconds(uint32_t ms) { return std::to_string((ms + 999) / 1000) + " s"; }

// To the nearest minute: the server's Date header has whole seconds only.
int64_t minutes_left(int64_t ms) { return (ms + 30000) / 60000; }

constexpr uint32_t kConsoleReadMs = 10000;

std::string join(const std::vector<uint16_t> &values) {
  std::string text;
  for (size_t i = 0; i < values.size(); i++) {
    if (i) text += ',';
    text += std::to_string(values[i]);
  }
  return text;
}

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
    case Command::Kind::Ir:
      if (read_) {
        ports_.console.print("busy — already reading an IR code");
      } else {
        ports_.console.print("listening for an IR code (10 s) …");
        start_read(Read::For::Console, "", kConsoleReadMs);
      }
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
  const bool was_up = wifi_up_;
  wifi_up_ = true;
  wifi_attempt_ = 0;
  ports_.timers.cancel(TimerId::WifiRetry);
  // Up again while up (e.g. a DHCP renewal): the link is fine as it is.
  if (was_up && (backend_ == Backend::Connected || backend_ == Backend::Connecting)) return;
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
  if (read_ && read_->who == Read::For::Backend) end_read();
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
  // The backend fails the command itself when a device disconnects.
  if (read_ && read_->who == Read::For::Backend) end_read();
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
      if (read_) {
        ports_.link.send(encode_error("BUSY", message->command_id, "already reading an IR code"));
      } else {
        start_read(Read::For::Backend, message->command_id,
                   message->timeout_ms ? message->timeout_ms : 15000);
      }
      return;
    case ServerMessage::Type::SendIr:
      ports_.link.send(encode_error("INVALID_COMMAND", message->command_id,
                                    "sending IR is not supported yet"));
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

void Device::start_read(Read::For who, std::string command_id, uint32_t timeout_ms) {
  read_ = Read{who, std::move(command_id), IrCapture{}, false};
  ports_.timers.schedule(TimerId::IrDeadline, timeout_ms);
  ports_.ir.start();
}

void Device::end_read() {
  ports_.timers.cancel(TimerId::IrSilence);
  ports_.timers.cancel(TimerId::IrDeadline);
  ports_.ir.stop();
  read_.reset();
}

void Device::on_ir_part(IrPart part) {
  if (!read_) return;
  if (!read_->capture.add(part)) {
    // It starts the next code: finish this one first.
    finish_code();
    if (!read_) return;
    read_->capture.add(part);
  }
  const int64_t silence_ends = read_->capture.ended_at_us() + IrCapture::kEndSilenceUs;
  const int64_t wait_ms = (silence_ends - ports_.timers.now_us() + 999) / 1000;
  ports_.timers.schedule(TimerId::IrSilence, static_cast<uint32_t>(wait_ms > 0 ? wait_ms : 1));
}

// The code so far is complete: answer with it, or keep listening if it was
// only noise.
void Device::finish_code() {
  IrCapture::Result result = read_->capture.finish();
  using Kind = IrCapture::Result::Kind;
  if (result.kind == Kind::TooShort) {
    if (read_->deadline_passed) read_timed_out();
    return;
  }
  if (read_->who == Read::For::Backend) {
    if (result.kind == Kind::Code) {
      ports_.link.send(encode_read_ir_result(read_->command_id, result.timings));
      ports_.console.print("read an IR code: " + std::to_string(result.timings.size()) +
                           " timings");
    } else {
      ports_.link.send(encode_error("CAPTURE_TOO_LONG", read_->command_id,
                                    "the IR code is longer than 2048 timings"));
    }
  } else if (result.kind == Kind::Code) {
    std::string summary = "IR code: " + std::to_string(result.parts) +
                          (result.parts == 1 ? " part" : " parts");
    for (size_t i = 0; i < result.gaps_ms.size(); i++) {
      summary += (i ? ", " : ", gaps ") + std::to_string(result.gaps_ms[i]) + " ms";
    }
    ports_.console.print(summary + "; " + std::to_string(result.timings.size()) + " timings");
    ports_.console.print("timings: " + join(result.timings));
  } else {
    ports_.console.print("IR: code too long (over 2048 timings)");
  }
  end_read();
}

void Device::read_timed_out() {
  if (read_->who == Read::For::Backend) {
    ports_.link.send(
        encode_error("READ_TIMEOUT", read_->command_id, "no IR code within the timeout"));
  } else {
    ports_.console.print("IR: no code in 10 s");
  }
  end_read();
}

void Device::on_timer(TimerId id) {
  switch (id) {
    case TimerId::IrSilence:
      if (read_) finish_code();
      return;
    case TimerId::IrDeadline:
      if (!read_) return;
      // A code half captured gets its silence: it answers, not the timeout.
      if (!read_->capture.empty()) {
        read_->deadline_passed = true;
        return;
      }
      read_timed_out();
      return;
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
  ports_.console.print(std::string("IR         ") +
                       (!read_ ? "idle"
                        : read_->who == Read::For::Backend ? "reading (backend)"
                                                           : "reading (console)"));
  if (code_) {
    const int64_t left = code_deadline_ms_ - ports_.timers.now_ms();
    ports_.console.print("pairing    " + group_pairing_code(*code_) + " (" +
                         std::to_string(minutes_left(left)) + " min left)");
  } else {
    ports_.console.print("pairing    none");
  }
}

}  // namespace core
