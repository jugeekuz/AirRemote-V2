#pragma once

#include <atomic>
#include <string>
#include <vector>

#include "core/device.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "runtime/event_queue.hpp"

// The Linux build's IR receiver, for the e2e tests. While listening, it polls
// a file every 50 ms; when one appears it reads and deletes it, then plays its
// parts in real time the way the board's receiver delivers them: activity
// while a part is on the air, and the part reported 30 ms after it ends. One line per part
// (comma-separated µs timings); a line "gap <ms>" between two parts sets the
// silence between them, which is 30 ms (the shortest the board can report as
// separate parts) when no line says otherwise.
class FileIrReceiver : public core::IrReceiver {
 public:
  FileIrReceiver(std::string path, runtime::EventQueue &queue)
      : path_(std::move(path)), queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }

  // Plays parts in real time as the board's receiver delivers them, if
  // listening: `gaps_us[i]` is the silence before part i. Blocks while it
  // plays. The file and the stand-in transmitter's echo both use it.
  void play(const std::vector<std::vector<uint16_t>> &parts, const std::vector<int64_t> &gaps_us);
  bool listening() const { return listening_; }

  void start() override;
  void stop() override { listening_ = false; }
  int64_t last_activity_us() override { return last_activity_us_; }

 private:
  static void poll(void *self);
  void deliver();

  std::string path_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
  std::atomic<bool> listening_{false};
  std::atomic<int64_t> last_activity_us_{0};
  // One play() at a time (the file and the transmitter's echo), as one
  // receiver only ever hears one thing at once.
  SemaphoreHandle_t playing_ = xSemaphoreCreateMutex();
  bool polling_ = false;
};
