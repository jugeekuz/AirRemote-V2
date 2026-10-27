#pragma once

#include <functional>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

namespace runtime {

// Runs every posted call on the one task that calls run(), in order. Device
// is not thread-safe; every driver callback reaches it through here.
class EventQueue {
 public:
  // Room for bursts (a code's parts, link events) while Device is busy.
  explicit EventQueue(size_t length = 128);
  // From any task (not an ISR). Drops the call if the queue stays full for 1 s.
  void post(std::function<void()> call);
  // Never returns.
  [[noreturn]] void run();

 private:
  QueueHandle_t queue_;
};

}  // namespace runtime
