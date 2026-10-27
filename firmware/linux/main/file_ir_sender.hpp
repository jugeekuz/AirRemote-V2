#pragma once

#include <string>

#include "core/device.hpp"
#include "file_ir_receiver.hpp"
#include "runtime/event_queue.hpp"

// The Linux build's IR transmitter, for the e2e tests. Each code is appended
// to a file as one line of comma-separated timings (rebuilt from the symbols,
// so the conversion is checked too), and, while the stand-in receiver is
// listening, played into it, as the board's LEDs reach its receiver. It
// reports success once the code's length has passed.
class FileIrSender : public core::IrSender {
 public:
  FileIrSender(std::string path, FileIrReceiver &receiver, runtime::EventQueue &queue)
      : path_(std::move(path)), receiver_(receiver), queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }

  void send(std::vector<core::IrSymbol> symbols) override;

 private:
  struct Job {
    FileIrSender *sender;
    std::vector<uint16_t> timings;
  };
  static void run(void *job);

  std::string path_;
  FileIrReceiver &receiver_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
};
