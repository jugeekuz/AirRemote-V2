#include "file_ir_receiver.hpp"

#include <cstdio>
#include <fstream>
#include <numeric>
#include <sstream>
#include <vector>

#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace {

constexpr int64_t kDefaultGapUs = 30000;

struct ParsedPart {
  std::vector<uint16_t> timings;
  int64_t gap_before_us = kDefaultGapUs;
};

bool parse(std::istream &input, std::vector<ParsedPart> &parts) {
  std::string line;
  int64_t gap = kDefaultGapUs;
  bool pending_gap = false;
  while (std::getline(input, line)) {
    if (line.empty()) continue;
    if (line.rfind("gap ", 0) == 0) {
      char *end = nullptr;
      const long ms = std::strtol(line.c_str() + 4, &end, 10);
      if (*end != '\0' || ms < 30) return false;  // shorter gaps are one part on the board
      if (pending_gap) return false;              // two gaps in a row
      gap = ms * 1000;
      pending_gap = true;
      continue;
    }
    ParsedPart part{{}, gap};
    std::stringstream values(line);
    std::string value;
    while (std::getline(values, value, ',')) {
      char *end = nullptr;
      const long timing = std::strtol(value.c_str(), &end, 10);
      if (value.empty() || *end != '\0' || timing <= 0 || timing > 65535) return false;
      part.timings.push_back(static_cast<uint16_t>(timing));
    }
    if (part.timings.empty()) return false;
    parts.push_back(std::move(part));
    gap = kDefaultGapUs;
    pending_gap = false;
  }
  // A gap must sit between two parts.
  return !parts.empty() && !pending_gap;
}

}  // namespace

void FileIrReceiver::start() {
  listening_ = true;
  if (!polling_) {
    polling_ = true;
    xTaskCreate(&FileIrReceiver::poll, "ir-file", 8192, this, 5, nullptr);
  }
}

void FileIrReceiver::poll(void *self) {
  auto *receiver = static_cast<FileIrReceiver *>(self);
  for (;;) {
    if (receiver->listening_) receiver->deliver();
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

void FileIrReceiver::deliver() {
  std::ifstream file(path_);
  if (!file) return;
  std::vector<ParsedPart> parts;
  const bool ok = parse(file, parts);
  file.close();
  std::remove(path_.c_str());
  if (!ok) {
    printf("IR file: could not parse %s\n", path_.c_str());
    fflush(stdout);
    return;
  }

  std::vector<std::vector<uint16_t>> timings;
  std::vector<int64_t> gaps;
  for (auto &part : parts) {
    timings.push_back(std::move(part.timings));
    gaps.push_back(part.gap_before_us);
  }
  play(timings, gaps);
}

void FileIrReceiver::play(const std::vector<std::vector<uint16_t>> &parts,
                          const std::vector<int64_t> &gaps_us) {
  xSemaphoreTake(playing_, portMAX_DELAY);
  // Parts are timed on a schedule (start, then each part's length and gap),
  // which their reported ends follow exactly; the waits in real time around
  // it are only as precise as the 10 ms tick, which Device tolerates.
  core::Device *device = device_;
  auto wait_until = [](int64_t at_us) {
    const int64_t left = at_us - esp_timer_get_time();
    if (left > 0) vTaskDelay(pdMS_TO_TICKS((left + 999) / 1000) + 1);
  };
  int64_t at = esp_timer_get_time();
  for (size_t i = 0; i < parts.size(); i++) {
    if (i > 0) at += gaps_us[i];
    const int64_t duration = std::accumulate(parts[i].begin(), parts[i].end(), int64_t{0});
    wait_until(at);
    // Edges all through the part.
    while (esp_timer_get_time() < at + duration) {
      last_activity_us_ = esp_timer_get_time();
      vTaskDelay(1);
    }
    at += duration;
    last_activity_us_ = at;
    wait_until(at + core::IrCapture::kReportDelayUs);
    if (!listening_) continue;
    core::IrPart part{parts[i], at, false};
    queue_.post([device, part] { device->on_ir_part(part); });
  }
  xSemaphoreGive(playing_);
}
