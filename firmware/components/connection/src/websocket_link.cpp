#include "connection/websocket_link.hpp"

#include <cstdio>

namespace connection {

namespace {

constexpr int kTextFrame = 0x1;
constexpr int kContinuation = 0x0;

}  // namespace

WebSocketLink::WebSocketLink(std::string url, const TlsMaterial &tls,
                             runtime::EventQueue &queue)
    : url_(std::move(url)), tls_(tls), queue_(queue) {}

WebSocketLink::~WebSocketLink() { destroy(); }

void WebSocketLink::post(std::function<void(core::Device &)> call) {
  core::Device *device = device_;
  if (!device) return;
  queue_.post([device, call = std::move(call)] { call(*device); });
}

void WebSocketLink::open() {
  destroy();
  opened_ = false;
  reported_ = false;
  handshake_status_ = 0;
  message_.clear();

  esp_websocket_client_config_t config = {};
  config.uri = url_.c_str();
  config.subprotocol = "airremote.v1";
  config.cert_pem = tls_.server_ca.c_str();
  config.client_cert = tls_.cert.c_str();
  config.client_cert_len = tls_.cert.size() + 1;
  config.client_key = tls_.key.c_str();
  config.client_key_len = tls_.key.size() + 1;
  config.disable_auto_reconnect = true;
  config.network_timeout_ms = 10000;
  config.buffer_size = 4096;
  // The mTLS handshake runs on the client's task; 4 KB (the default) is not
  // enough for it on the board.
  config.task_stack = 8192;

  client_ = esp_websocket_client_init(&config);
  if (!client_) {
    post([](core::Device &device) { device.on_link_failed(); });
    return;
  }
  esp_websocket_register_events(client_, WEBSOCKET_EVENT_ANY, &WebSocketLink::on_event, this);
  if (esp_websocket_client_start(client_) != ESP_OK) {
    destroy();
    post([](core::Device &device) { device.on_link_failed(); });
  }
}

void WebSocketLink::send(std::string_view text) {
  if (!client_ || !esp_websocket_client_is_connected(client_)) return;
  esp_websocket_client_send_text(client_, text.data(), static_cast<int>(text.size()),
                                 pdMS_TO_TICKS(2000));
}

// Device closes only to drop the link for good (e.g. Wi-Fi changed): nothing
// is reported for it.
void WebSocketLink::close() { destroy(); }

void WebSocketLink::destroy() {
  if (!client_) return;
  esp_websocket_client_handle_t client = client_;
  client_ = nullptr;  // events from it are ignored from now on
  esp_websocket_client_stop(client);
  esp_websocket_client_destroy(client);
}

void WebSocketLink::on_event(void *self, esp_event_base_t, int32_t id, void *data) {
  auto *event = static_cast<esp_websocket_event_data_t *>(data);
  auto *link = static_cast<WebSocketLink *>(self);
  if (!event || event->client != link->client_) return;  // an old client's leftovers
  link->handle(id, event);
}

void WebSocketLink::handle(int32_t id, esp_websocket_event_data_t *data) {
  switch (id) {
    case WEBSOCKET_EVENT_CONNECTED:
      opened_ = true;
      post([](core::Device &device) { device.on_link_opened(); });
      return;

    case WEBSOCKET_EVENT_DATA: {
      if (data->op_code != kTextFrame && data->op_code != kContinuation) return;
      if (data->payload_offset == 0) message_.clear();
      message_.append(data->data_ptr, data->data_len);
      if (data->payload_offset + data->data_len < data->payload_len) return;
      std::string text = std::move(message_);
      message_.clear();
      post([text](core::Device &device) { device.on_link_message(text); });
      return;
    }

    case WEBSOCKET_EVENT_ERROR:
      if (data->error_handle.esp_ws_handshake_status_code != 0) {
        handshake_status_ = data->error_handle.esp_ws_handshake_status_code;
      }
      return;

    case WEBSOCKET_EVENT_DISCONNECTED:
    case WEBSOCKET_EVENT_CLOSED:
    // The client's task ending: a last chance to report, as some failures end
    // it without a DISCONNECTED.
    case WEBSOCKET_EVENT_FINISH: {
      if (reported_) return;
      reported_ = true;
      if (opened_) {
        post([](core::Device &device) { device.on_link_closed(); });
      } else if (handshake_status_ >= 300) {
        const int status = handshake_status_;
        post([status](core::Device &device) { device.on_link_refused(status); });
      } else {
        post([](core::Device &device) { device.on_link_failed(); });
      }
      return;
    }

    default:
      return;
  }
}

}  // namespace connection
