#include "runtime/timers.hpp"

namespace runtime {

FreeRtosTimers::FreeRtosTimers(EventQueue &queue) : queue_(queue) {
  for (size_t i = 0; i < kCount; i++) {
    slots_[i] = Slot{this, i};
    timers_[i] = xTimerCreate("device", 1, pdFALSE, &slots_[i], &FreeRtosTimers::fired);
  }
}

int64_t FreeRtosTimers::now_ms() {
  return static_cast<int64_t>(xTaskGetTickCount()) * portTICK_PERIOD_MS;
}

void FreeRtosTimers::schedule(core::TimerId id, uint32_t ms) {
  const size_t i = static_cast<size_t>(id);
  generation_[i]++;
  const TickType_t ticks = pdMS_TO_TICKS(ms) > 0 ? pdMS_TO_TICKS(ms) : 1;
  xTimerChangePeriod(timers_[i], ticks, portMAX_DELAY);  // also starts it
}

void FreeRtosTimers::cancel(core::TimerId id) {
  const size_t i = static_cast<size_t>(id);
  generation_[i]++;
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
    self->device_->on_timer(static_cast<core::TimerId>(i));
  });
}

}  // namespace runtime
