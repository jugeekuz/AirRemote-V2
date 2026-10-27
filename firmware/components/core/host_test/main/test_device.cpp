#include <memory>
#include <string>
#include <vector>

#include <unity.h>

#include "core/protocol.hpp"
#include "fakes.hpp"

using core::TimerId;

namespace {

const char *kCommandId = "6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11";

struct Rig {
  FakeConsole console;
  FakeWifi wifi;
  FakeSettings settings;
  FakeLink link;
  FakePairing pairing;
  FakeTimers timers;
  FakeIr ir;
  std::unique_ptr<core::Device> device;

  explicit Rig(bool provisioned = true, bool backend_configured = true,
               bool wifi_saved = true) {
    if (wifi_saved) settings.stored = core::WifiCredentials{"Home", "secret123"};
    device = std::make_unique<core::Device>(
        core::DeviceInfo{"0.1.0", "24:DC:C3:8D:3E:0C", provisioned, backend_configured},
        core::Ports{console, wifi, settings, link, pairing, timers, ir});
    timers.device = device.get();
  }

  // Started, on Wi-Fi, with the link being opened.
  static std::unique_ptr<Rig> online() {
    auto rig = std::make_unique<Rig>();
    rig->device->start();
    rig->device->on_wifi_up();
    return rig;
  }

  static std::unique_ptr<Rig> not_enrolled() {
    auto rig = online();
    rig->device->on_link_refused(403);
    return rig;
  }

  static std::unique_ptr<Rig> connected() {
    auto rig = online();
    rig->device->on_link_opened();
    return rig;
  }
};

const std::vector<uint32_t> kBackoff = {1000, 2000, 4000, 8000, 16000, 30000, 30000};

}  // namespace

TEST_CASE("without an identity it says how to provision and does nothing else", "[device]") {
  Rig rig(false);
  rig.device->start();
  TEST_ASSERT_TRUE(rig.console.printed("not provisioned — run scripts/provision-device.sh"));
  TEST_ASSERT_EQUAL(0, (int)rig.wifi.connects.size());
  rig.device->on_line("wifi Other password123");
  TEST_ASSERT_EQUAL(0, (int)rig.wifi.connects.size());
  TEST_ASSERT_EQUAL(0, rig.link.opens);
}

TEST_CASE("without a backend address it says so and connects nothing", "[device]") {
  Rig rig(true, false);
  rig.device->start();
  TEST_ASSERT_TRUE(
      rig.console.printed("no backend address — write firmware/backend-url.txt and rebuild"));
  TEST_ASSERT_EQUAL(0, (int)rig.wifi.connects.size());
}

TEST_CASE("without saved Wi-Fi it asks for it", "[device]") {
  Rig rig(true, true, false);
  rig.device->start();
  TEST_ASSERT_TRUE(rig.console.printed("no Wi-Fi — type: wifi <ssid> <password>"));
  TEST_ASSERT_EQUAL(0, (int)rig.wifi.connects.size());
}

TEST_CASE("with saved Wi-Fi it joins at start", "[device]") {
  Rig rig;
  rig.device->start();
  TEST_ASSERT_EQUAL(1, (int)rig.wifi.connects.size());
  TEST_ASSERT_EQUAL_STRING("Home", rig.wifi.connects[0].ssid.c_str());
}

TEST_CASE("wifi saves the details, then joins", "[device]") {
  Rig rig(true, true, false);
  rig.device->start();
  rig.device->on_line("wifi Other password123");
  TEST_ASSERT_EQUAL_STRING("Other", rig.settings.stored->ssid.c_str());
  TEST_ASSERT_EQUAL(1, (int)rig.wifi.connects.size());
  TEST_ASSERT_EQUAL_STRING("password123", rig.wifi.connects[0].password.c_str());
}

TEST_CASE("an invalid wifi prints the usage and saves nothing", "[device]") {
  Rig rig(true, true, false);
  rig.device->start();
  rig.device->on_line("wifi Other short");
  TEST_ASSERT_FALSE(rig.settings.stored.has_value());
  TEST_ASSERT_EQUAL(0, (int)rig.wifi.connects.size());
  TEST_ASSERT_TRUE(rig.console.any_contains("usage: wifi <ssid> [password]"));
}

TEST_CASE("wifi that cannot be saved says so and does not join", "[device]") {
  Rig rig(true, true, false);
  rig.settings.fail_save = true;
  rig.device->start();
  rig.device->on_line("wifi Other password123");
  TEST_ASSERT_EQUAL(0, (int)rig.wifi.connects.size());
  TEST_ASSERT_TRUE(rig.console.any_contains("could not save"));
}

TEST_CASE("Wi-Fi up opens the link", "[device]") {
  auto rig = Rig::online();
  TEST_ASSERT_EQUAL(1, rig->link.opens);
}

TEST_CASE("Wi-Fi down retries with backoff up to 30 s", "[device]") {
  Rig rig;
  rig.device->start();
  for (int i = 0; i < 7; i++) {
    rig.device->on_wifi_down();
    rig.timers.advance(30000);
  }
  TEST_ASSERT_EQUAL_UINT32_ARRAY(kBackoff.data(), rig.timers.delays(TimerId::WifiRetry).data(), 7);
  TEST_ASSERT_EQUAL(8, (int)rig.wifi.connects.size());
}

TEST_CASE("Wi-Fi up resets the Wi-Fi backoff", "[device]") {
  Rig rig;
  rig.device->start();
  rig.device->on_wifi_down();
  rig.timers.advance(1000);
  rig.device->on_wifi_down();
  rig.timers.advance(2000);
  rig.device->on_wifi_up();
  rig.device->on_wifi_down();
  TEST_ASSERT_EQUAL_UINT32(1000, rig.timers.delays(TimerId::WifiRetry).back());
}

TEST_CASE("Wi-Fi going down while connected closes the link and stops retrying it", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_wifi_down();
  TEST_ASSERT_EQUAL(1, rig->link.closes);
  TEST_ASSERT_FALSE(rig->timers.pending(TimerId::LinkRetry));
}

TEST_CASE("an opened link says hello first, then connected", "[device]") {
  auto rig = Rig::connected();
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(core::encode_hello("0.1.0").c_str(), rig->link.sent[0].c_str());
  TEST_ASSERT_TRUE(rig->console.printed("connected"));
}

TEST_CASE("a failing link retries with backoff, and opening resets it", "[device]") {
  auto rig = Rig::online();
  for (int i = 0; i < 7; i++) {
    rig->device->on_link_failed();
    rig->timers.advance(30000);
  }
  TEST_ASSERT_EQUAL_UINT32_ARRAY(kBackoff.data(), rig->timers.delays(TimerId::LinkRetry).data(), 7);
  TEST_ASSERT_EQUAL(8, rig->link.opens);
  rig->device->on_link_opened();
  rig->device->on_link_closed();
  TEST_ASSERT_EQUAL_UINT32(1000, rig->timers.delays(TimerId::LinkRetry).back());
}

TEST_CASE("a closed link reconnects and says hello again", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_link_closed();
  rig->timers.advance(1000);
  TEST_ASSERT_EQUAL(2, rig->link.opens);
  rig->device->on_link_opened();
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(core::encode_hello("0.1.0").c_str(), rig->link.sent[1].c_str());
}

TEST_CASE("other refusals are retried with backoff", "[device]") {
  auto rig = Rig::online();
  rig->device->on_link_refused(500);
  TEST_ASSERT_EQUAL_UINT32(1000, rig->timers.delays(TimerId::LinkRetry).back());
  TEST_ASSERT_FALSE(rig->console.printed("not enrolled — type: pair"));
}

TEST_CASE("a 403 says not enrolled once and keeps retrying every 30 s", "[device]") {
  auto rig = Rig::not_enrolled();
  for (int i = 0; i < 3; i++) {
    rig->timers.advance(30000);
    rig->device->on_link_refused(403);
  }
  TEST_ASSERT_EQUAL(1, (int)rig->console.count("not enrolled — type: pair"));
  TEST_ASSERT_EQUAL(4, rig->link.opens);
  for (uint32_t ms : rig->timers.delays(TimerId::LinkRetry)) TEST_ASSERT_EQUAL_UINT32(30000, ms);
  TEST_ASSERT_EQUAL(0, rig->pairing.requests);
}

TEST_CASE("a 403 after being connected keeps retrying too", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_link_closed();
  rig->timers.advance(1000);
  rig->device->on_link_refused(403);
  rig->timers.advance(30000);
  TEST_ASSERT_EQUAL(3, rig->link.opens);
}

TEST_CASE("pair asks for exactly one code", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_line("pair");
  TEST_ASSERT_EQUAL(1, rig->pairing.requests);
}

TEST_CASE("a pairing code is printed, then the link is retried every 5 s", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_code("7K4MQ9TX", 900000);
  TEST_ASSERT_TRUE(rig->console.printed("pairing code: 7K4M-Q9TX (expires in 15 min)"));
  const int opens = rig->link.opens;
  for (int i = 0; i < 3; i++) {
    rig->timers.advance(5000);
    rig->device->on_link_refused(403);
  }
  TEST_ASSERT_EQUAL(opens + 3, rig->link.opens);
  TEST_ASSERT_EQUAL(1, rig->pairing.requests);
}

TEST_CASE("enrolling after pair connects and clears the code", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_code("7K4MQ9TX", 900000);
  rig->timers.advance(5000);
  rig->device->on_link_opened();
  TEST_ASSERT_TRUE(rig->console.printed("connected"));
  TEST_ASSERT_FALSE(rig->timers.pending(TimerId::PairingExpiry));
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("pairing    none"));
}

TEST_CASE("an expired code says so and falls back to 30 s retries", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_code("7K4MQ9TX", 12000);
  for (int i = 0; i < 2; i++) {
    rig->timers.advance(5000);
    rig->device->on_link_refused(403);
  }
  rig->timers.advance(2000);
  TEST_ASSERT_TRUE(rig->console.printed("pairing code expired — type: pair"));
  rig->timers.advance(29000);
  rig->device->on_link_refused(403);
  TEST_ASSERT_EQUAL_UINT32(30000, rig->timers.delays(TimerId::LinkRetry).back());
}

TEST_CASE("pair again after expiry asks for a new code", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_code("7K4MQ9TX", 1000);
  rig->timers.advance(1000);
  rig->device->on_line("pair");
  TEST_ASSERT_EQUAL(2, rig->pairing.requests);
}

TEST_CASE("pair when connected, without Wi-Fi or while asking says why not", "[device]") {
  auto connected = Rig::connected();
  connected->device->on_line("pair");
  TEST_ASSERT_TRUE(connected->console.printed("already connected"));
  TEST_ASSERT_EQUAL(0, connected->pairing.requests);

  Rig offline;
  offline.device->start();
  offline.device->on_line("pair");
  TEST_ASSERT_TRUE(offline.console.any_contains("no Wi-Fi yet"));
  TEST_ASSERT_EQUAL(0, offline.pairing.requests);
}

TEST_CASE("a failed pairing request is printed and pair can be tried again", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_failed("HTTP 500");
  TEST_ASSERT_TRUE(rig->console.printed("could not get a pairing code: HTTP 500"));
  rig->device->on_line("pair");
  TEST_ASSERT_EQUAL(2, rig->pairing.requests);
}

TEST_CASE("sendIr is answered with INVALID_COMMAND", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(
      R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[1]})");
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("INVALID_COMMAND", kCommandId, "sending IR is not supported yet").c_str(),
      rig->link.sent[1].c_str());
}

TEST_CASE("the server's error is printed, garbage is ignored", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(R"({"type":"error","code":"INVALID_JSON","message":"bad"})");
  rig->device->on_link_message("{nope");
  rig->device->on_link_message(R"({"type":"whatever"})");
  TEST_ASSERT_TRUE(rig->console.printed("server error INVALID_JSON: bad"));
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
}

TEST_CASE("nothing is sent before the link opens", "[device]") {
  auto rig = Rig::online();
  rig->device->on_link_message(
      R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":1000})");
  TEST_ASSERT_EQUAL(0, (int)rig->link.sent.size());
}

TEST_CASE("status shows what the device knows", "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_code("7K4MQ9TX", 900000);
  rig->timers.advance(60000);
  rig->device->on_link_refused(403);  // the retry that was in flight
  rig->device->on_line("status");
  for (const char *line :
       {"firmware   0.1.0", "MAC        24:DC:C3:8D:3E:0C", "identity   provisioned",
        "Wi-Fi      Home (connected)", "backend    not enrolled",
        "pairing    7K4M-Q9TX (14 min left)"}) {
    TEST_ASSERT_TRUE_MESSAGE(rig->console.printed(line), line);
  }
}

TEST_CASE("help lists the commands", "[device]") {
  Rig rig;
  rig.device->on_line("help");
  TEST_ASSERT_TRUE(rig.console.any_contains("wifi <ssid> [password]"));
  TEST_ASSERT_TRUE(rig.console.any_contains("pair"));
}

TEST_CASE("changing Wi-Fi while connected closes the link and rejoins", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_line("wifi Other password123");
  TEST_ASSERT_EQUAL(1, rig->link.closes);
  TEST_ASSERT_EQUAL(2, (int)rig->wifi.connects.size());
  rig->device->on_link_closed();
  TEST_ASSERT_FALSE(rig->timers.pending(TimerId::LinkRetry));
}

TEST_CASE("a code's minutes are rounded to the nearest, as Date has whole seconds",
          "[device]") {
  auto rig = Rig::not_enrolled();
  rig->device->on_line("pair");
  rig->device->on_pairing_code("7K4MQ9TX", 900999);
  TEST_ASSERT_TRUE(rig->console.printed("pairing code: 7K4M-Q9TX (expires in 15 min)"));
}

TEST_CASE("Wi-Fi up again while connected keeps the link", "[device]") {
  auto rig = Rig::connected();
  rig->device->on_wifi_up();  // e.g. a DHCP renewal
  TEST_ASSERT_EQUAL(1, rig->link.opens);
  TEST_ASSERT_EQUAL(0, rig->link.closes);
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("backend    connected"));
}


// --- Reading IR ---

namespace {

const std::string kReadIr =
    R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":15000})";
const char *kOtherId = "11111111-2222-4333-8444-555555555555";

std::vector<uint16_t> code_of(size_t count) { return std::vector<uint16_t>(count, 560); }

// A part that ended just now.
core::IrPart part_now(Rig &rig, const std::vector<uint16_t> &timings, bool overflowed = false) {
  return core::IrPart{timings, rig.timers.now_us(), overflowed};
}

std::string read_ir(const char *id, uint32_t timeout_ms = 15000) {
  return std::string(R"({"type":"readIr","commandId":")") + id + R"(","timeoutMs":)" +
         std::to_string(timeout_ms) + "}";
}

}  // namespace

TEST_CASE("readIr starts the receiver with the command's timeout", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  TEST_ASSERT_TRUE(rig->ir.listening);
  TEST_ASSERT_TRUE(rig->timers.pending(TimerId::IrDeadline));
  TEST_ASSERT_EQUAL_UINT32(15000, rig->timers.delays(TimerId::IrDeadline).back());
}

TEST_CASE("a code answers readIr once with its timings, after 50 ms of silence", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  const auto code = code_of(67);
  rig->device->on_ir_part(part_now(*rig, code));
  rig->timers.advance(49);
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());  // just the hello
  rig->timers.advance(1);
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code).c_str(),
                           rig->link.sent[1].c_str());
  TEST_ASSERT_FALSE(rig->ir.listening);
  rig->timers.advance(20000);
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
}

TEST_CASE("no code before the timeout answers READ_TIMEOUT once", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->timers.advance(15000);
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("READ_TIMEOUT", kCommandId, "no IR code within the timeout").c_str(),
      rig->link.sent[1].c_str());
  TEST_ASSERT_FALSE(rig->ir.listening);
}

TEST_CASE("noise before a code is skipped", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->device->on_ir_part(part_now(*rig, code_of(2)));
  rig->timers.advance(100);
  TEST_ASSERT_TRUE(rig->ir.listening);
  rig->device->on_ir_part(part_now(*rig, code_of(67)));
  rig->timers.advance(50);
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code_of(67)).c_str(),
                           rig->link.sent.back().c_str());
}

TEST_CASE("a code that is too long answers CAPTURE_TOO_LONG", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->device->on_ir_part(part_now(*rig, code_of(895), true));
  rig->timers.advance(50);
  TEST_ASSERT_EQUAL_STRING(core::encode_error("CAPTURE_TOO_LONG", kCommandId,
                                              "the IR code is longer than 2048 timings")
                               .c_str(),
                           rig->link.sent.back().c_str());
}

TEST_CASE("a second readIr while reading answers BUSY and leaves the first", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->device->on_link_message(read_ir(kOtherId));
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("BUSY", kOtherId, "already reading an IR code").c_str(),
      rig->link.sent.back().c_str());
  rig->device->on_ir_part(part_now(*rig, code_of(67)));
  rig->timers.advance(50);
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code_of(67)).c_str(),
                           rig->link.sent.back().c_str());
}

TEST_CASE("the link closing mid-read stops the receiver and sends nothing", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->device->on_link_closed();
  TEST_ASSERT_FALSE(rig->ir.listening);
  const size_t sent = rig->link.sent.size();
  rig->timers.advance(20000);
  TEST_ASSERT_EQUAL(sent, rig->link.sent.size());
}

TEST_CASE("dropping the link itself (a Wi-Fi change) stops a backend read", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->device->on_line("wifi Other password123");
  TEST_ASSERT_FALSE(rig->ir.listening);
}

TEST_CASE("a part while not reading is ignored", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_ir_part(part_now(*rig, code_of(67)));
  rig->timers.advance(100);
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
}

TEST_CASE("a code and the deadline at the same instant give one reply", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(read_ir(kCommandId, 1000));
  rig->timers.advance(950);
  rig->device->on_ir_part(part_now(*rig, code_of(67)));  // silence ends at 1000
  rig->timers.advance(1000);
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code_of(67)).c_str(),
                           rig->link.sent[1].c_str());
}

TEST_CASE("a deadline with a code half captured waits for the silence", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(read_ir(kCommandId, 1000));
  rig->timers.advance(990);
  rig->device->on_ir_part(part_now(*rig, code_of(67)));
  rig->timers.advance(10);  // the deadline passes mid-code
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
  rig->timers.advance(40);
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code_of(67)).c_str(),
                           rig->link.sent.back().c_str());
}

TEST_CASE("a deadline with only noise captured is a timeout", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(read_ir(kCommandId, 1000));
  rig->timers.advance(990);
  rig->device->on_ir_part(part_now(*rig, code_of(3)));
  rig->timers.advance(100);
  TEST_ASSERT_TRUE(rig->link.sent.back().find("READ_TIMEOUT") != std::string::npos);
  TEST_ASSERT_FALSE(rig->ir.listening);
}

TEST_CASE("sendIr still answers INVALID_COMMAND", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(
      R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[1]})");
  TEST_ASSERT_TRUE(rig->link.sent.back().find("INVALID_COMMAND") != std::string::npos);
}

TEST_CASE("ir prints what it captured", "[device][ir]") {
  Rig rig(false, false, false);  // works without an identity, a backend or Wi-Fi
  rig.device->start();
  rig.device->on_line("ir");
  TEST_ASSERT_TRUE(rig.console.printed("listening for an IR code (10 s) …"));
  TEST_ASSERT_TRUE(rig.ir.listening);
  const std::vector<uint16_t> part = {9000, 4500, 560, 560, 560, 1690, 560};
  rig.device->on_ir_part(core::IrPart{part, 0, false});
  // The part lasts 17 430 µs; the next starts 35 ms after it ends.
  rig.timers.now = 53;
  rig.device->on_ir_part(core::IrPart{part, 35000 + 17430, false});
  rig.timers.advance(50);
  TEST_ASSERT_TRUE(rig.console.printed("IR code: 2 parts, gaps 35 ms; 15 timings"));
  TEST_ASSERT_TRUE(rig.console.printed(
      "timings: 9000,4500,560,560,560,1690,560,35000,9000,4500,560,560,560,1690,560"));
  TEST_ASSERT_FALSE(rig.ir.listening);
}

TEST_CASE("ir with one part, and with no code", "[device][ir]") {
  Rig rig;
  rig.device->on_line("ir");
  rig.device->on_ir_part(core::IrPart{code_of(67), rig.timers.now_us(), false});
  rig.timers.advance(50);
  TEST_ASSERT_TRUE(rig.console.printed("IR code: 1 part; 67 timings"));
  rig.device->on_line("ir");
  rig.timers.advance(10000);
  TEST_ASSERT_TRUE(rig.console.printed("IR: no code in 10 s"));
  rig.device->on_line("ir");
  rig.device->on_ir_part(core::IrPart{code_of(895), rig.timers.now_us(), true});
  rig.timers.advance(50);
  TEST_ASSERT_TRUE(rig.console.printed("IR: code too long (over 2048 timings)"));
}

TEST_CASE("ir and readIr refuse each other", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_line("ir");
  rig->device->on_link_message(kReadIr);
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("BUSY", kCommandId, "already reading an IR code").c_str(),
      rig->link.sent.back().c_str());

  auto backend = Rig::connected();
  backend->device->on_link_message(kReadIr);
  backend->device->on_line("ir");
  TEST_ASSERT_TRUE(backend->console.printed("busy — already reading an IR code"));
}

TEST_CASE("status shows what IR is doing", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("IR         idle"));
  rig->device->on_link_message(kReadIr);
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("IR         reading (backend)"));
}
