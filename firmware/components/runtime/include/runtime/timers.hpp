#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "core/device.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/timers.h"
#include "runtime/event_queue.hpp"

namespace runtime {

// core::Timers over FreeRTOS one-shot timers. Each firing is posted to the
// queue; one that was cancelled or rescheduled after it fired is dropped.
class FreeRtosTimers : public core::Timers {
 public:
  explicit FreeRtosTimers(EventQueue &queue);
  void attach(core::Device &device) { device_ = &device; }

  int64_t now_ms() override;
  int64_t now_us() override;
  void schedule(core::TimerId id, uint32_t ms) override;
  void cancel(core::TimerId id) override;

 private:
  static constexpr size_t kCount = 5;
  // What each FreeRTOS timer's ID points to.
  struct Slot {
    FreeRtosTimers *owner;
    size_t index;
  };
  static void fired(TimerHandle_t timer);

  EventQueue &queue_;
  core::Device *device_ = nullptr;
  std::array<Slot, kCount> slots_{};
  std::array<TimerHandle_t, kCount> timers_{};
  std::array<std::atomic<uint32_t>, kCount> generation_{};
  // When each timer is due, owned by Device's task; a firing before it (one
  // overtaken by a reschedule) or after a cancel (kNotArmed) is dropped.
  static constexpr int64_t kNotArmed = INT64_MAX;
  std::array<int64_t, kCount> due_ms_{};
};

}  // namespace runtime
