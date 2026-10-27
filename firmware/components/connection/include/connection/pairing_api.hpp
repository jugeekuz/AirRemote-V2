#pragma once

#include <string>

#include "connection/tls.hpp"
#include "core/device.hpp"
#include "runtime/event_queue.hpp"

namespace connection {

// core::PairingApi: POST /pairing-code over mTLS, on a task of its own so a
// slow server never blocks Device.
class HttpPairingApi : public core::PairingApi {
 public:
  HttpPairingApi(std::string url, const TlsMaterial &tls, runtime::EventQueue &queue);
  void attach(core::Device &device) { device_ = &device; }

  void request() override;

 private:
  static void run(void *self);
  void perform();

  std::string url_;
  const TlsMaterial &tls_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
};

}  // namespace connection
