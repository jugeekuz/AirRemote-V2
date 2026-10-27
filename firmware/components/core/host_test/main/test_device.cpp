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
  std::unique_ptr<core::Device> device;

  explicit Rig(bool provisioned = true, bool backend_configured = true,
               bool wifi_saved = true) {
    if (wifi_saved) settings.stored = core::WifiCredentials{"Home", "secret123"};
    device = std::make_unique<core::Device>(
        core::DeviceInfo{"0.1.0", "24:DC:C3:8D:3E:0C", provisioned, backend_configured},
        core::Ports{console, wifi, settings, link, pairing, timers});
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

TEST_CASE("readIr and sendIr are each answered with INVALID_COMMAND", "[device]") {
  auto rig = Rig::connected();
  const std::string expected =
      core::encode_error("INVALID_COMMAND", kCommandId, "IR is not supported yet");
  rig->device->on_link_message(
      R"({"type":"readIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timeoutMs":1000})");
  rig->device->on_link_message(
      R"({"type":"sendIr","commandId":"6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11","timingsUs":[1]})");
  TEST_ASSERT_EQUAL(3, (int)rig->link.sent.size());
  TEST_ASSERT_EQUAL_STRING(expected.c_str(), rig->link.sent[1].c_str());
  TEST_ASSERT_EQUAL_STRING(expected.c_str(), rig->link.sent[2].c_str());
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
