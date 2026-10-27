#pragma once

#include <atomic>

#include "core/device.hpp"
#include "driver/rmt_rx.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "runtime/event_queue.hpp"

namespace board {

// core::IrReceiver on the RMT, reading the TSOP38238 (low while it sees the
// carrier). Each RMT capture ends after 30 ms of silence and is one IrPart;
// core joins parts into codes. The ISR re-arms the next capture at once, into
// the other of two buffers, because parts can be only ~5 ms apart once the
// 30 ms idle has elapsed.
class RmtIrReceiver : public core::IrReceiver {
 public:
  static constexpr size_t kSymbols = 448;  // 7 of the 8 RMT blocks; one is left for sending
  static constexpr uint32_t kIdleNs = 30'000'000;

  RmtIrReceiver(gpio_num_t pin, runtime::EventQueue &queue) : pin_(pin), queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }
  // Once: the RX channel and the task that turns captures into parts.
  void init();

  void start() override;
  void stop() override;
  int64_t last_activity_us() override;

 private:
  struct Done {
    int buffer;
    size_t symbols;
    int64_t at_us;
  };
  static bool on_done(rmt_channel_handle_t channel, const rmt_rx_done_event_data_t *data,
                      void *self);
  static void convert(void *self);
  static void on_edge(void *self);

  gpio_num_t pin_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
  rmt_channel_handle_t channel_ = nullptr;
  rmt_receive_config_t receive_{};
  QueueHandle_t done_ = nullptr;
  rmt_symbol_word_t buffers_[2][kSymbols] = {};
  int next_buffer_ = 0;
  std::atomic<bool> listening_{false};
  // Written by the edge ISR; 64-bit, so under a spinlock rather than atomic.
  portMUX_TYPE activity_lock_ = portMUX_INITIALIZER_UNLOCKED;
  int64_t last_activity_us_ = 0;
};

}  // namespace board
