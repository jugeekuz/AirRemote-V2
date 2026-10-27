#pragma once

#include <algorithm>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "core/device.hpp"

// Fakes for every port Device drives. Each records what it was asked to do.

struct FakeConsole : core::Console {
  std::vector<std::string> lines;
  void print(std::string_view line) override { lines.emplace_back(line); }
  bool printed(std::string_view line) const {
    return std::find(lines.begin(), lines.end(), line) != lines.end();
  }
  size_t count(std::string_view line) const {
    return std::count(lines.begin(), lines.end(), line);
  }
  bool any_contains(std::string_view text) const {
    return std::any_of(lines.begin(), lines.end(),
                       [&](const std::string &l) { return l.find(text) != std::string::npos; });
  }
};

struct FakeWifi : core::Wifi {
  std::vector<core::WifiCredentials> connects;
  void connect(const core::WifiCredentials &credentials) override {
    connects.push_back(credentials);
  }
};

struct FakeSettings : core::Settings {
  std::optional<core::WifiCredentials> stored;
  bool fail_save = false;
  std::optional<core::WifiCredentials> load_wifi() override { return stored; }
  bool save_wifi(const core::WifiCredentials &credentials) override {
    if (fail_save) return false;
    stored = credentials;
    return true;
  }
};

struct FakeLink : core::Link {
  int opens = 0, closes = 0;
  std::vector<std::string> sent;
  void open() override { opens++; }
  void send(std::string_view text) override { sent.emplace_back(text); }
  void close() override { closes++; }
};

struct FakeIr : core::IrReceiver {
  int starts = 0, stops = 0;
  bool listening = false;
  void start() override {
    starts++;
    listening = true;
  }
  void stop() override {
    stops++;
    listening = false;
  }
};

struct FakePairing : core::PairingApi {
  int requests = 0;
  void request() override { requests++; }
};

// Timers that fire only when the test advances time. Scheduling an id that is
// already scheduled replaces it.
struct FakeTimers : core::Timers {
  int64_t now = 0;
  std::map<core::TimerId, int64_t> due;
  core::Device *device = nullptr;
  std::vector<std::pair<core::TimerId, uint32_t>> scheduled;

  int64_t now_ms() override { return now; }
  int64_t now_us() override { return now * 1000; }
  void schedule(core::TimerId id, uint32_t ms) override {
    due[id] = now + ms;
    scheduled.emplace_back(id, ms);
  }
  void cancel(core::TimerId id) override { due.erase(id); }
  bool pending(core::TimerId id) const { return due.count(id) != 0; }

  // Runs every timer due by now + ms, in order, then stops at now + ms.
  void advance(int64_t ms) {
    const int64_t until = now + ms;
    for (;;) {
      auto next = std::min_element(due.begin(), due.end(),
                                   [](auto &a, auto &b) { return a.second < b.second; });
      if (next == due.end() || next->second > until) break;
      const core::TimerId id = next->first;
      now = next->second;
      due.erase(next);
      device->on_timer(id);
    }
    now = until;
  }

  // The delays scheduled for `id`, in order.
  std::vector<uint32_t> delays(core::TimerId id) const {
    std::vector<uint32_t> result;
    for (auto &[scheduled_id, ms] : scheduled)
      if (scheduled_id == id) result.push_back(ms);
    return result;
  }
};
