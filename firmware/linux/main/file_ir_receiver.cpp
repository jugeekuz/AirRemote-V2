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
  while (std::getline(input, line)) {
    if (line.empty()) continue;
    if (line.rfind("gap ", 0) == 0) {
      const long ms = std::strtol(line.c_str() + 4, nullptr, 10);
      if (ms < 30) return false;  // shorter gaps are one part on the board
      gap = ms * 1000;
      continue;
    }
    ParsedPart part{{}, gap};
    std::stringstream values(line);
    std::string value;
    while (std::getline(values, value, ',')) {
      const long timing = std::strtol(value.c_str(), nullptr, 10);
      if (timing <= 0 || timing > 65535) return false;
      part.timings.push_back(static_cast<uint16_t>(timing));
    }
    if (part.timings.empty()) return false;
    parts.push_back(std::move(part));
    gap = kDefaultGapUs;
  }
  return !parts.empty();
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

  // Lay the parts out backwards from now: the last ends now, and each earlier
  // part ends where the next one's gap begins.
  std::vector<int64_t> ended_at(parts.size());
  int64_t end = esp_timer_get_time();
  for (size_t i = parts.size(); i-- > 0;) {
    ended_at[i] = end;
    const int64_t duration =
        std::accumulate(parts[i].timings.begin(), parts[i].timings.end(), int64_t{0});
    end -= duration + parts[i].gap_before_us;
  }
  core::Device *device = device_;
  for (size_t i = 0; i < parts.size(); i++) {
    core::IrPart part{parts[i].timings, ended_at[i], false};
    queue_.post([device, part] { device->on_ir_part(part); });
  }
}
