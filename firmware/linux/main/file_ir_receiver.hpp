#pragma once

#include <atomic>
#include <string>

#include "core/device.hpp"
#include "runtime/event_queue.hpp"

// The Linux build's IR receiver, for the e2e tests. While listening, it polls
// a file every 50 ms; when one appears it reads and deletes it, and reports
// its parts as if the receiver had just captured them. One line per part
// (comma-separated µs timings); a line "gap <ms>" between two parts sets the
// silence between them, which is 30 ms (the shortest the board can report as
// separate parts) when no line says otherwise.
class FileIrReceiver : public core::IrReceiver {
 public:
  FileIrReceiver(std::string path, runtime::EventQueue &queue)
      : path_(std::move(path)), queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }

  void start() override;
  void stop() override { listening_ = false; }

 private:
  static void poll(void *self);
  void deliver();

  std::string path_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
  std::atomic<bool> listening_{false};
  bool polling_ = false;
};
