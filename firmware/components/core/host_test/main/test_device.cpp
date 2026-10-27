#include <memory>
#include <string>
#include <vector>

#include <unity.h>

#include "core/ir_symbols.hpp"
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
  FakeIrSender sender;
  std::unique_ptr<core::Device> device;

  explicit Rig(bool provisioned = true, bool backend_configured = true,
               bool wifi_saved = true) {
    if (wifi_saved) settings.stored = core::WifiCredentials{"Home", "secret123"};
    device = std::make_unique<core::Device>(
        core::DeviceInfo{"0.1.0", "24:DC:C3:8D:3E:0C", provisioned, backend_configured},
        core::Ports{console, wifi, settings, link, pairing, timers, ir, sender});
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

// Plays parts the way the board's receiver delivers them (each part's length
// must be whole milliseconds, for the fake clock): activity while each
// part is on the air, and the part reported 30 ms after it ends (the RMT's
// idle). `gaps_ms[i]` is the silence before part i (ignored for the first).
// Timers run in between, as on the board.
void play(Rig &rig, const std::vector<std::vector<uint16_t>> &parts,
          const std::vector<int64_t> &gaps_ms = {}) {
  for (size_t i = 0; i < parts.size(); i++) {
    if (i > 0) rig.timers.advance(gaps_ms[i] - 30);  // the previous report came 30 ms in
    int64_t duration_us = 0;
    for (uint16_t t : parts[i]) duration_us += t;
    // Edges all through the part, as the receiver's edge interrupt sees them.
    for (int64_t ms = 0; ms < duration_us / 1000; ms++) {
      rig.ir.last_activity = rig.timers.now_us();
      rig.timers.advance(1);
    }
    rig.ir.last_activity = rig.timers.now_us();
    const int64_t ended = rig.timers.now_us();
    rig.timers.advance(30);
    rig.device->on_ir_part(core::IrPart{parts[i], ended, false});
  }
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

TEST_CASE("a code answers readIr once, 50 ms of silence plus the 30 ms report delay after it", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  const auto code = code_of(67);
  rig->device->on_ir_part(part_now(*rig, code));
  rig->timers.advance(79);
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
  rig->timers.advance(80);
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code_of(67)).c_str(),
                           rig->link.sent.back().c_str());
}

TEST_CASE("a code that is too long answers CAPTURE_TOO_LONG", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  rig->device->on_ir_part(part_now(*rig, code_of(895), true));
  rig->timers.advance(80);
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
      core::encode_error("BUSY", kOtherId, "already using IR").c_str(),
      rig->link.sent.back().c_str());
  rig->device->on_ir_part(part_now(*rig, code_of(67)));
  rig->timers.advance(80);
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
  rig->timers.advance(920);
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
  rig->timers.advance(70);
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



TEST_CASE("ir prints what it captured, parts joined on the receiver's real timing",
          "[device][ir]") {
  Rig rig(false, false, false);  // works without an identity, a backend or Wi-Fi
  rig.device->start();
  rig.device->on_line("ir");
  TEST_ASSERT_TRUE(rig.console.printed("listening for an IR code (10 s) …"));
  TEST_ASSERT_TRUE(rig.ir.listening);
  // 17 ms of part, then 35 ms of silence, then the same again.
  const std::vector<uint16_t> part = {9000, 4500, 560, 560, 560, 1260, 560};
  play(rig, {part, part}, {0, 35});
  rig.timers.advance(80);
  TEST_ASSERT_TRUE(rig.console.printed("IR code: 2 parts, gaps 35 ms; 15 timings"));
  TEST_ASSERT_TRUE(rig.console.printed(
      "timings: 9000,4500,560,560,560,1260,560,35000,9000,4500,560,560,560,1260,560"));
  TEST_ASSERT_FALSE(rig.ir.listening);
}

TEST_CASE("an air-conditioner code in 3 parts is learned whole", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  // 1000 µs timings: play() runs on a millisecond clock.
  const std::vector<uint16_t> a(39, 1000), b(135, 1000), c(271, 1000);
  play(*rig, {a, b, c}, {0, 35, 40});
  rig->timers.advance(80);
  std::vector<uint16_t> expected = a;
  expected.push_back(35000);
  expected.insert(expected.end(), b.begin(), b.end());
  expected.push_back(40000);
  expected.insert(expected.end(), c.begin(), c.end());
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, expected).c_str(),
                           rig->link.sent[1].c_str());
}

TEST_CASE("a part 60 ms later is not part of the code", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  play(*rig, {code_of(67), code_of(67)}, {0, 60});
  rig->timers.advance(200);
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(core::encode_read_ir_result(kCommandId, code_of(67)).c_str(),
                           rig->link.sent[1].c_str());
}

TEST_CASE("activity that never becomes a part does not hold the read open", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kReadIr);
  play(*rig, {code_of(67)});
  rig->timers.advance(10);
  rig->ir.last_activity = rig->timers.now_us();  // a glitch the RMT filtered
  rig->timers.advance(79);
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
  rig->timers.advance(1);
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
}

TEST_CASE("steady IR past the deadline still ends the read, 2 s later", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(read_ir(kCommandId, 1000));
  rig->timers.advance(900);
  rig->device->on_ir_part(part_now(*rig, code_of(67)));
  for (int i = 0; i < 400 && rig->link.sent.size() == 1; i++) {
    rig->ir.last_activity = rig->timers.now_us();  // e.g. flickering LED lighting
    rig->timers.advance(10);
  }
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
  TEST_ASSERT_TRUE(rig->timers.now <= 1000 + 2000 + 10);
  TEST_ASSERT_FALSE(rig->ir.listening);
}

TEST_CASE("a part captured before the read started is ignored", "[device][ir]") {
  auto rig = Rig::connected();
  rig->timers.advance(1000);
  const core::IrPart stale{code_of(67), rig->timers.now_us() - 100000, false};
  rig->device->on_link_message(kReadIr);
  rig->device->on_ir_part(stale);
  rig->timers.advance(200);
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
  TEST_ASSERT_TRUE(rig->ir.listening);
}

TEST_CASE("ir with one part, and with no code", "[device][ir]") {
  Rig rig;
  rig.device->on_line("ir");
  rig.device->on_ir_part(core::IrPart{code_of(67), rig.timers.now_us(), false});
  rig.timers.advance(80);
  TEST_ASSERT_TRUE(rig.console.printed("IR code: 1 part; 67 timings"));
  rig.device->on_line("ir");
  rig.timers.advance(10000);
  TEST_ASSERT_TRUE(rig.console.printed("IR: no code in 10 s"));
  rig.device->on_line("ir");
  rig.device->on_ir_part(core::IrPart{code_of(895), rig.timers.now_us(), true});
  rig.timers.advance(80);
  TEST_ASSERT_TRUE(rig.console.printed("IR: code too long (over 2048 timings)"));
}

TEST_CASE("ir and readIr refuse each other", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_line("ir");
  rig->device->on_link_message(kReadIr);
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("BUSY", kCommandId, "already using IR").c_str(),
      rig->link.sent.back().c_str());

  auto backend = Rig::connected();
  backend->device->on_link_message(kReadIr);
  backend->device->on_line("ir");
  TEST_ASSERT_TRUE(backend->console.printed("busy — already using IR"));
}

TEST_CASE("status shows what IR is doing", "[device][ir]") {
  auto rig = Rig::connected();
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("IR         idle"));
  rig->device->on_link_message(kReadIr);
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("IR         reading (backend)"));
}


// --- Sending IR ---

namespace {

const std::string kSendIr =
    R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[9000,4500,560]})";

std::string send_ir(const char *id) {
  return std::string(R"({"type":"sendIr","commandId":")") + id +
         R"(","timingsUs":[9000,4500,560]})";
}

}  // namespace

TEST_CASE("sendIr transmits the code once and answers when it has gone out", "[device][send]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kSendIr);
  TEST_ASSERT_EQUAL(1, (int)rig->sender.sends.size());
  TEST_ASSERT_TRUE(core::to_timings(rig->sender.sends[0]) ==
                   (std::vector<uint16_t>{9000, 4500, 560}));
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());  // no reply yet
  rig->device->on_ir_sent(true);
  TEST_ASSERT_EQUAL_STRING(core::encode_send_ir_result(kCommandId).c_str(),
                           rig->link.sent.back().c_str());
  rig->device->on_ir_sent(true);  // a stray second report
  TEST_ASSERT_EQUAL(2, (int)rig->link.sent.size());
}

TEST_CASE("a failed transmission answers SEND_FAILED", "[device][send]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kSendIr);
  rig->device->on_ir_sent(false);
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("SEND_FAILED", kCommandId, "the IR code could not be sent").c_str(),
      rig->link.sent.back().c_str());
}

TEST_CASE("sending and reading refuse each other with BUSY", "[device][send]") {
  auto reading = Rig::connected();
  reading->device->on_link_message(kReadIr);
  reading->device->on_link_message(send_ir(kOtherId));
  TEST_ASSERT_EQUAL_STRING(
      core::encode_error("BUSY", kOtherId, "already using IR").c_str(),
      reading->link.sent.back().c_str());
  TEST_ASSERT_EQUAL(0, (int)reading->sender.sends.size());

  auto sending = Rig::connected();
  sending->device->on_link_message(kSendIr);
  sending->device->on_link_message(read_ir(kOtherId));
  sending->device->on_link_message(send_ir(kOtherId));
  TEST_ASSERT_EQUAL(1, (int)sending->sender.sends.size());
  TEST_ASSERT_FALSE(sending->ir.listening);
  TEST_ASSERT_EQUAL(3, (int)sending->link.sent.size());  // hello + two BUSY
  sending->device->on_line("ir");
  TEST_ASSERT_TRUE(sending->console.printed("busy — already using IR"));
}

TEST_CASE("a link closing mid-send gets no reply, and the next send works", "[device][send]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kSendIr);
  rig->device->on_link_closed();
  rig->device->on_ir_sent(true);
  TEST_ASSERT_EQUAL(1, (int)rig->link.sent.size());
  rig->timers.advance(1000);
  rig->device->on_link_opened();
  rig->device->on_link_message(kSendIr);
  TEST_ASSERT_EQUAL(2, (int)rig->sender.sends.size());
  rig->device->on_ir_sent(true);
  TEST_ASSERT_EQUAL_STRING(core::encode_send_ir_result(kCommandId).c_str(),
                           rig->link.sent.back().c_str());
}

TEST_CASE("status shows a send", "[device][send]") {
  auto rig = Rig::connected();
  rig->device->on_link_message(kSendIr);
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("IR         sending"));
}

// --- The self-test ---

TEST_CASE("ir selftest listens, sends the test code, and passes on its echo", "[device][selftest]") {
  Rig rig;
  rig.device->on_line("ir selftest");
  TEST_ASSERT_TRUE(rig.ir.listening);
  TEST_ASSERT_EQUAL(1, (int)rig.sender.sends.size());
  const auto sent = core::to_timings(rig.sender.sends[0]);
  TEST_ASSERT_TRUE(sent == core::ir_self_test_code());
  rig.device->on_ir_sent(true);
  // What the receiver hears is never exact: each timing a bit off.
  std::vector<uint16_t> heard = sent;
  for (size_t i = 0; i < heard.size(); i++) heard[i] += (i % 2 ? -60 : 60);
  rig.device->on_ir_part(core::IrPart{heard, rig.timers.now_us(), false});
  rig.timers.advance(80);
  TEST_ASSERT_TRUE(rig.console.printed("IR self-test: OK (sent 67 timings, heard 67)"));
  TEST_ASSERT_FALSE(rig.ir.listening);
}

TEST_CASE("ir selftest fails on silence, a wrong timing, a wrong length, or a failed send",
          "[device][selftest]") {
  Rig silent;
  silent.device->on_line("ir selftest");
  silent.device->on_ir_sent(true);
  silent.timers.advance(10000);
  TEST_ASSERT_TRUE(silent.console.printed("IR self-test: FAILED — heard nothing"));

  Rig wrong;
  wrong.device->on_line("ir selftest");
  wrong.device->on_ir_sent(true);
  auto heard = core::ir_self_test_code();
  heard[5] = heard[5] / 2;
  wrong.device->on_ir_part(core::IrPart{heard, wrong.timers.now_us(), false});
  wrong.timers.advance(80);
  TEST_ASSERT_TRUE(wrong.console.any_contains("IR self-test: FAILED — timing 5: sent"));

  Rig shorter;
  shorter.device->on_line("ir selftest");
  shorter.device->on_ir_sent(true);
  auto cut = core::ir_self_test_code();
  cut.resize(65);
  shorter.device->on_ir_part(core::IrPart{cut, shorter.timers.now_us(), false});
  shorter.timers.advance(80);
  TEST_ASSERT_TRUE(shorter.console.printed("IR self-test: FAILED — sent 67 timings, heard 65"));

  Rig failed;
  failed.device->on_line("ir selftest");
  failed.device->on_ir_sent(false);
  TEST_ASSERT_TRUE(failed.console.printed("IR self-test: FAILED — could not send"));
  TEST_ASSERT_FALSE(failed.ir.listening);
}

TEST_CASE("during the self-test, readIr and sendIr are BUSY", "[device][selftest]") {
  auto rig = Rig::connected();
  rig->device->on_line("ir selftest");
  rig->device->on_link_message(kReadIr);
  rig->device->on_link_message(send_ir(kOtherId));
  TEST_ASSERT_EQUAL(3, (int)rig->link.sent.size());
  TEST_ASSERT_TRUE(rig->link.sent[1].find("BUSY") != std::string::npos);
  TEST_ASSERT_TRUE(rig->link.sent[2].find("BUSY") != std::string::npos);
  TEST_ASSERT_EQUAL(1, (int)rig->sender.sends.size());
  rig->device->on_line("status");
  TEST_ASSERT_TRUE(rig->console.printed("IR         self-test"));
}
