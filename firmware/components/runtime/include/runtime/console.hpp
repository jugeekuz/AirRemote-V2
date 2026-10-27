#pragma once

#include "core/device.hpp"
#include "runtime/event_queue.hpp"

namespace runtime {

// Prints a line to stdout (the UART on the board) and flushes it.
class StdoutConsole : public core::Console {
 public:
  void print(std::string_view line) override;
};

// Reads console lines on its own task and posts each to Device::on_line.
// Call after stdin is set up (the board's UART driver).
void start_console_reader(EventQueue &queue, core::Device &device);

}  // namespace runtime
