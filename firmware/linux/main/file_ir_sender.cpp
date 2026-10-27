#include "file_ir_sender.hpp"

#include <fstream>
#include <numeric>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void FileIrSender::send(std::vector<core::IrSymbol> symbols) {
  auto *job = new Job{this, core::to_timings(symbols)};
  if (xTaskCreate(&FileIrSender::run, "ir-send", 8192, job, 5, nullptr) != pdPASS) {
    delete job;
    core::Device *device = device_;
    queue_.post([device] { device->on_ir_sent(false); });
  }
}

void FileIrSender::run(void *arg) {
  auto *job = static_cast<Job *>(arg);
  FileIrSender *sender = job->sender;
  bool ok = true;
  if (!sender->path_.empty()) {
    std::ofstream file(sender->path_, std::ios::app);
    for (size_t i = 0; i < job->timings.size(); i++) file << (i ? "," : "") << job->timings[i];
    file << "\n";
    ok = static_cast<bool>(file);
  }
  if (sender->receiver_.listening()) {
    sender->receiver_.play({job->timings}, {0});  // the echo the self-test listens for
  } else {
    const int64_t us = std::accumulate(job->timings.begin(), job->timings.end(), int64_t{0});
    vTaskDelay(pdMS_TO_TICKS(us / 1000) + 1);
  }
  core::Device *device = sender->device_;
  sender->queue_.post([device, ok] { device->on_ir_sent(ok); });
  delete job;
  vTaskDelete(nullptr);
}
