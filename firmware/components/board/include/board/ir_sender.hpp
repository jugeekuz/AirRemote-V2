#pragma once

#include <vector>

#include "core/device.hpp"
#include "driver/rmt_tx.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "runtime/event_queue.hpp"

namespace board {

// core::IrSender on the RMT, driving the IR LEDs (through the transistor):
// marks are a 38 kHz carrier at 33% duty, spaces are off, and the LEDs are off
// when a code ends. It uses the one RMT memory block the receiver leaves; the
// driver refills it while sending, so long codes go out whole.
class RmtIrSender : public core::IrSender {
 public:
  static constexpr size_t kSymbols = 64;
  static constexpr uint32_t kCarrierHz = 38000;

  RmtIrSender(gpio_num_t pin, runtime::EventQueue &queue) : pin_(pin), queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }
  // Once, after the receiver has taken its blocks.
  void init();

  void send(std::vector<core::IrSymbol> symbols) override;

 private:
  static void run(void *self);

  gpio_num_t pin_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
  rmt_channel_handle_t channel_ = nullptr;
  rmt_encoder_handle_t encoder_ = nullptr;
  QueueHandle_t jobs_ = nullptr;
};

}  // namespace board
