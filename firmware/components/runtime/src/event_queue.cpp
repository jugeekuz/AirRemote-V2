#include "runtime/event_queue.hpp"

#include <cstdio>

namespace runtime {

EventQueue::EventQueue(size_t length)
    : queue_(xQueueCreate(length, sizeof(std::function<void()> *))) {}

void EventQueue::post(std::function<void()> call) {
  auto *boxed = new std::function<void()>(std::move(call));
  if (xQueueSend(queue_, &boxed, pdMS_TO_TICKS(1000)) != pdTRUE) {
    delete boxed;
    printf("event queue full: dropped an event\n");
    fflush(stdout);
  }
}

void EventQueue::run() {
  for (;;) {
    std::function<void()> *call = nullptr;
    if (xQueueReceive(queue_, &call, portMAX_DELAY) == pdTRUE && call) {
      (*call)();
      delete call;
    }
  }
}

}  // namespace runtime
