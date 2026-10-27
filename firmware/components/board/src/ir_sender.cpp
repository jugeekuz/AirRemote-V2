#include "board/ir_sender.hpp"

#include "esp_log.h"
#include "freertos/task.h"

namespace board {

namespace {

const char *TAG = "ir-send";

}  // namespace

void RmtIrSender::init() {
  rmt_tx_channel_config_t config = {};
  config.gpio_num = pin_;
  config.clk_src = RMT_CLK_SRC_DEFAULT;
  config.resolution_hz = 1'000'000;  // 1 µs per tick
  config.mem_block_symbols = kSymbols;
  config.trans_queue_depth = 1;
  ESP_ERROR_CHECK(rmt_new_tx_channel(&config, &channel_));

  rmt_carrier_config_t carrier = {};
  carrier.frequency_hz = kCarrierHz;
  carrier.duty_cycle = 0.33f;
  ESP_ERROR_CHECK(rmt_apply_carrier(channel_, &carrier));

  rmt_copy_encoder_config_t copy = {};
  ESP_ERROR_CHECK(rmt_new_copy_encoder(&copy, &encoder_));
  ESP_ERROR_CHECK(rmt_enable(channel_));

  jobs_ = xQueueCreate(1, sizeof(std::vector<core::IrSymbol> *));
  xTaskCreate(&RmtIrSender::run, "ir-send", 4096, this, 6, nullptr);
}

void RmtIrSender::send(std::vector<core::IrSymbol> symbols) {
  auto *job = new std::vector<core::IrSymbol>(std::move(symbols));
  if (xQueueSend(jobs_, &job, 0) != pdTRUE) {
    delete job;
    core::Device *device = device_;
    queue_.post([device] { device->on_ir_sent(false); });
  }
}

// On its own task: pack the symbols in pairs (a 0 duration ends a
// transmission, so an odd one out is padded with it), send, wait.
void RmtIrSender::run(void *self) {
  auto *sender = static_cast<RmtIrSender *>(self);
  for (;;) {
    std::vector<core::IrSymbol> *job = nullptr;
    if (xQueueReceive(sender->jobs_, &job, portMAX_DELAY) != pdTRUE || !job) continue;

    std::vector<rmt_symbol_word_t> words((job->size() + 1) / 2);
    for (size_t i = 0; i < job->size(); i++) {
      const core::IrSymbol &symbol = (*job)[i];
      rmt_symbol_word_t &word = words[i / 2];
      if (i % 2 == 0) {
        word.level0 = symbol.mark;
        word.duration0 = symbol.duration;
        word.level1 = 0;
        word.duration1 = 0;
      } else {
        word.level1 = symbol.mark;
        word.duration1 = symbol.duration;
      }
    }
    int64_t total_us = 0;
    for (const auto &symbol : *job) total_us += symbol.duration;
    delete job;

    rmt_transmit_config_t transmit = {};
    transmit.loop_count = 0;
    transmit.flags.eot_level = 0;  // LEDs off afterwards
    bool ok = !words.empty() &&
              rmt_transmit(sender->channel_, sender->encoder_, words.data(),
                           words.size() * sizeof(rmt_symbol_word_t), &transmit) == ESP_OK;
    if (ok && rmt_tx_wait_all_done(sender->channel_, static_cast<int>(total_us / 1000) + 1000) !=
                  ESP_OK) {
      // Still sending after its length plus a second: abort it before `words`
      // (which the RMT refills from) goes away; disabling also turns the LEDs
      // off, and enabling again leaves the channel ready for the next code.
      ok = false;
      rmt_disable(sender->channel_);
      rmt_enable(sender->channel_);
    }
    if (!ok) ESP_LOGE(TAG, "could not send the IR code");
    core::Device *device = sender->device_;
    if (device) sender->queue_.post([device, ok] { device->on_ir_sent(ok); });
  }
}

}  // namespace board
