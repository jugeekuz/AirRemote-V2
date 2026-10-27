#pragma once

#include "core/device.hpp"
#include "esp_event.h"
#include "runtime/event_queue.hpp"

namespace board {

// core::Wifi in station mode. Up once it has an IP address; down on every
// disconnect, which Device answers with a retry.
class EspWifi : public core::Wifi {
 public:
  explicit EspWifi(runtime::EventQueue &queue) : queue_(queue) {}
  void attach(core::Device &device) { device_ = &device; }
  // Once, after esp_netif_init() and the default event loop.
  void start();

  void connect(const core::WifiCredentials &credentials) override;

 private:
  static void on_event(void *self, esp_event_base_t base, int32_t id, void *data);

  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;
};

}  // namespace board
