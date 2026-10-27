#pragma once

#include <atomic>
#include <string>

#include "connection/tls.hpp"
#include "core/device.hpp"
#include "esp_websocket_client.h"
#include "runtime/event_queue.hpp"

namespace connection {

// core::Link over esp_websocket_client. Retries are Device's, so the client's
// own reconnect is off; every outcome of an open() is reported once.
class WebSocketLink : public core::Link {
 public:
  WebSocketLink(std::string url, const TlsMaterial &tls, runtime::EventQueue &queue);
  ~WebSocketLink() override;
  void attach(core::Device &device) { device_ = &device; }

  void open() override;
  void send(std::string_view text) override;
  void close() override;

 private:
  static void on_event(void *self, esp_event_base_t base, int32_t id, void *data);
  void handle(int32_t id, esp_websocket_event_data_t *data);
  void destroy();
  void post(std::function<void(core::Device &)> call);

  std::string url_;
  const TlsMaterial &tls_;
  runtime::EventQueue &queue_;
  core::Device *device_ = nullptr;

  // Written on Device's task, read on the client's.
  std::atomic<esp_websocket_client_handle_t> client_{nullptr};
  // Only the client task touches these, for the current client.
  bool opened_ = false;
  bool reported_ = false;
  int handshake_status_ = 0;
  std::string failure_;   // why it failed, from the last error event
  std::string message_;   // a text message arriving in pieces or frames
  bool dropping_ = false;  // the message in progress is too long: skip it
};

}  // namespace connection
