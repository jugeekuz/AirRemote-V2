#include "board/ir_receiver.hpp"

#include <vector>

#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/task.h"

namespace board {

namespace {

const char *TAG = "ir";

// A capture this full may have been cut short: the RMT memory ran out.
constexpr size_t kFullSymbols = RmtIrReceiver::kSymbols - 1;

}  // namespace

void RmtIrReceiver::init() {
  rmt_rx_channel_config_t config = {};
  config.gpio_num = pin_;
  config.clk_src = RMT_CLK_SRC_DEFAULT;
  config.resolution_hz = 1'000'000;  // 1 µs per tick
  config.mem_block_symbols = kSymbols;
  config.flags.invert_in = 1;  // a mark (TSOP output low) reads as level 1
  ESP_ERROR_CHECK(rmt_new_rx_channel(&config, &channel_));

  rmt_rx_event_callbacks_t callbacks = {};
  callbacks.on_recv_done = &RmtIrReceiver::on_done;
  ESP_ERROR_CHECK(rmt_rx_register_event_callbacks(channel_, &callbacks, this));

  // Shorter pulses are glitches; about the most the classic ESP32 can filter.
  // core removes the longer glitches (under 100 µs) itself.
  receive_.signal_range_min_ns = 3000;
  receive_.signal_range_max_ns = kIdleNs;

  // Every edge on the pin, part or not: tells Device a part is still on the
  // air (the RMT reports one only 30 ms after it ends).
  gpio_set_intr_type(pin_, GPIO_INTR_ANYEDGE);
  esp_err_t isr = gpio_install_isr_service(ESP_INTR_FLAG_IRAM);
  if (isr != ESP_OK && isr != ESP_ERR_INVALID_STATE) ESP_ERROR_CHECK(isr);
  ESP_ERROR_CHECK(gpio_isr_handler_add(pin_, &RmtIrReceiver::on_edge, this));

  done_ = xQueueCreate(4, sizeof(Done));
  xTaskCreate(&RmtIrReceiver::convert, "ir", 4096, this, 6, nullptr);
}

void RmtIrReceiver::start() {
  if (listening_) return;
  listening_ = true;
  // Already enabled when a stop() raced the ISR's re-arm: carry on.
  const esp_err_t enabled = rmt_enable(channel_);
  if (enabled != ESP_OK && enabled != ESP_ERR_INVALID_STATE) ESP_ERROR_CHECK(enabled);
  next_buffer_ = 0;
  if (rmt_receive(channel_, buffers_[0], sizeof(buffers_[0]), &receive_) != ESP_OK) {
    ESP_LOGE(TAG, "could not start receiving");
  }
}

void RmtIrReceiver::stop() {
  if (!listening_) return;
  listening_ = false;
  if (rmt_disable(channel_) != ESP_OK) ESP_LOGW(TAG, "could not stop receiving");
}

int64_t RmtIrReceiver::last_activity_us() {
  portENTER_CRITICAL(&activity_lock_);
  const int64_t at = last_activity_us_;
  portEXIT_CRITICAL(&activity_lock_);
  return at;
}

void IRAM_ATTR RmtIrReceiver::on_edge(void *self) {
  auto *receiver = static_cast<RmtIrReceiver *>(self);
  const int64_t now = esp_timer_get_time();
  portENTER_CRITICAL_ISR(&receiver->activity_lock_);
  receiver->last_activity_us_ = now;
  portEXIT_CRITICAL_ISR(&receiver->activity_lock_);
}

// In the ISR: re-arm into the other buffer first, so the next part is not
// missed, then hand the finished one to the task.
bool IRAM_ATTR RmtIrReceiver::on_done(rmt_channel_handle_t channel,
                                      const rmt_rx_done_event_data_t *data, void *self) {
  auto *receiver = static_cast<RmtIrReceiver *>(self);
  const int finished = receiver->next_buffer_;
  Done done{finished, data->num_symbols, esp_timer_get_time()};
  if (receiver->listening_) {
    receiver->next_buffer_ = 1 - finished;
    rmt_receive(channel, receiver->buffers_[receiver->next_buffer_],
                sizeof(receiver->buffers_[0]), &receiver->receive_);
  }
  BaseType_t woken = pdFALSE;
  xQueueSendFromISR(receiver->done_, &done, &woken);
  return woken == pdTRUE;
}

// On its own task: symbols to mark/space durations, starting and ending with a
// mark, then a part for Device.
void RmtIrReceiver::convert(void *self) {
  auto *receiver = static_cast<RmtIrReceiver *>(self);
  for (;;) {
    Done done;
    if (xQueueReceive(receiver->done_, &done, portMAX_DELAY) != pdTRUE) continue;
    const rmt_symbol_word_t *symbols = receiver->buffers_[done.buffer];

    std::vector<uint16_t> timings;
    int level = -1;
    auto add = [&](int half_level, uint32_t duration) {
      if (duration == 0) return;                        // the end marker
      if (timings.empty() && half_level == 0) return;  // idle before the first mark
      if (half_level == level) {
        uint32_t merged = timings.back() + duration;
        timings.back() = static_cast<uint16_t>(merged > 65535 ? 65535 : merged);
      } else {
        timings.push_back(static_cast<uint16_t>(duration > 65535 ? 65535 : duration));
        level = half_level;
      }
    };
    for (size_t i = 0; i < done.symbols; i++) {
      add(symbols[i].level0, symbols[i].duration0);
      add(symbols[i].level1, symbols[i].duration1);
    }
    if (level == 0 && !timings.empty()) timings.pop_back();  // the silence that ended it
    if (timings.empty()) continue;

    core::IrPart part{std::move(timings), done.at_us - kIdleNs / 1000,
                      done.symbols >= kFullSymbols};
    core::Device *device = receiver->device_;
    if (device) receiver->queue_.post([device, part] { device->on_ir_part(part); });
  }
}

}  // namespace board
