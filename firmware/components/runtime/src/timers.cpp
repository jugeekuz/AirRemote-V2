#include "runtime/timers.hpp"

#include "esp_timer.h"

namespace runtime {

FreeRtosTimers::FreeRtosTimers(EventQueue &queue) : queue_(queue) {
  due_ms_.fill(kNotArmed);
  for (size_t i = 0; i < kCount; i++) {
    slots_[i] = Slot{this, i};
    timers_[i] = xTimerCreate("device", 1, pdFALSE, &slots_[i], &FreeRtosTimers::fired);
  }
}

int64_t FreeRtosTimers::now_ms() {
  return static_cast<int64_t>(xTaskGetTickCount()) * portTICK_PERIOD_MS;
}

int64_t FreeRtosTimers::now_us() { return esp_timer_get_time(); }

void FreeRtosTimers::schedule(core::TimerId id, uint32_t ms) {
  const size_t i = static_cast<size_t>(id);
  generation_[i]++;
  due_ms_[i] = now_ms() + ms;
  // Rounded up, plus one: the tick is 10 ms, and a timer must never fire
  // early (IR silence waits are short).
  const TickType_t ticks = (ms + portTICK_PERIOD_MS - 1) / portTICK_PERIOD_MS + 1;
  xTimerChangePeriod(timers_[i], ticks, portMAX_DELAY);  // also starts it
}

void FreeRtosTimers::cancel(core::TimerId id) {
  const size_t i = static_cast<size_t>(id);
  generation_[i]++;
  due_ms_[i] = kNotArmed;
  xTimerStop(timers_[i], portMAX_DELAY);
}

// On the FreeRTOS timer task: hand the firing to Device's task. A firing that
// was overtaken by cancel() or schedule() in the meantime is dropped there.
void FreeRtosTimers::fired(TimerHandle_t timer) {
  auto *slot = static_cast<Slot *>(pvTimerGetTimerID(timer));
  FreeRtosTimers *self = slot->owner;
  const size_t i = slot->index;
  const uint32_t generation = self->generation_[i];
  self->queue_.post([self, i, generation] {
    if (self->generation_[i] != generation || !self->device_) return;
    // The generation can be read after a reschedule bumped it; the deadline,
    // set on this task, can't be fooled that way.
    if (self->now_ms() < self->due_ms_[i]) return;
    self->due_ms_[i] = kNotArmed;
    self->device_->on_timer(static_cast<core::TimerId>(i));
  });
}

}  // namespace runtime
