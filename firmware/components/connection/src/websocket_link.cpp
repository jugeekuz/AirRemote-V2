#include "connection/websocket_link.hpp"

#include <cerrno>
#include <cstdio>

#include "esp_log.h"
#include "esp_tls_errors.h"

namespace connection {

namespace {

constexpr int kTextFrame = 0x1;
constexpr int kContinuation = 0x0;
// The longest protocol message is ~12 KB (a 2048-timing sendIr).
constexpr size_t kMaxMessage = 16 * 1024;

// The libraries log every failed attempt to the console people type on;
// Device prints one line with the reason instead.
void quiet_libraries() {
  for (const char *tag : {"websocket_client", "transport_ws", "transport_base", "trans_tcp",
                          "esp-tls", "esp-tls-mbedtls", "HTTP_CLIENT"}) {
    esp_log_level_set(tag, ESP_LOG_NONE);
  }
}

// Why a connection failed, in a few words, from the client's error report.
std::string describe(const esp_websocket_error_codes_t &error) {
  if (error.error_type == WEBSOCKET_ERROR_TYPE_PONG_TIMEOUT) return "the backend stopped answering";
  switch (error.esp_tls_stack_err) {
    case -0x2700:  // MBEDTLS_ERR_X509_CERT_VERIFY_FAILED
      return "TLS: the server certificate was rejected";
    case -0x7780:  // MBEDTLS_ERR_SSL_FATAL_ALERT_MESSAGE
      return "TLS: the backend rejected this device's certificate";
    case 0:
      break;
    default: {
      char text[40];
      snprintf(text, sizeof(text), "TLS error -0x%04x", -error.esp_tls_stack_err);
      return text;
    }
  }
  switch (error.esp_tls_last_esp_err) {
    case ESP_ERR_ESP_TLS_CANNOT_RESOLVE_HOSTNAME:
      return "the host name does not resolve";
    case ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT:
      return "no answer from the host";
    case ESP_ERR_ESP_TLS_FAILED_CONNECT_TO_HOST:
      // lwIP reports a refused connection (a reset) as ECONNRESET.
      return error.esp_transport_sock_errno == ECONNREFUSED ||
                     error.esp_transport_sock_errno == ECONNRESET
                 ? "connection refused — is the backend running?"
                 : "cannot reach the host";
    default:
      return "";
  }
}

}  // namespace

WebSocketLink::WebSocketLink(std::string url, const TlsMaterial &tls,
                             runtime::EventQueue &queue)
    : url_(std::move(url)), tls_(tls), queue_(queue) {
  quiet_libraries();
}

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
  failure_.clear();
  message_.clear();
  dropping_ = false;

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

  esp_websocket_client_handle_t client = esp_websocket_client_init(&config);
  if (!client) {
    post([](core::Device &device) { device.on_link_failed("out of memory"); });
    return;
  }
  esp_websocket_register_events(client, WEBSOCKET_EVENT_ANY, &WebSocketLink::on_event, this);
  client_ = client;
  if (esp_websocket_client_start(client) != ESP_OK) {
    destroy();
    post([](core::Device &device) { device.on_link_failed(); });
  }
}

void WebSocketLink::send(std::string_view text) {
  esp_websocket_client_handle_t client = client_;
  if (!client || !esp_websocket_client_is_connected(client) ||
      esp_websocket_client_send_text(client, text.data(), static_cast<int>(text.size()),
                                     pdMS_TO_TICKS(2000)) < 0) {
    printf("could not send to the backend\n");
    fflush(stdout);
  }
}

// Device closes only to drop the link for good (e.g. Wi-Fi changed): nothing
// is reported for it.
void WebSocketLink::close() { destroy(); }

void WebSocketLink::destroy() {
  esp_websocket_client_handle_t client = client_.exchange(nullptr);
  // Events from it are ignored from now on. destroy() stops it if it still
  // runs (stopping one that already ended only warns).
  if (client) esp_websocket_client_destroy(client);
}

void WebSocketLink::on_event(void *self, esp_event_base_t, int32_t id, void *data) {
  auto *event = static_cast<esp_websocket_event_data_t *>(data);
  auto *link = static_cast<WebSocketLink *>(self);
  if (!event || event->client != link->client_.load()) return;  // an old client's leftovers
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
      // A text frame starts a message; continuation frames add to it.
      if (data->op_code == kTextFrame && data->payload_offset == 0) {
        message_.clear();
        dropping_ = false;
      }
      if (!dropping_) {
        if (message_.size() + data->data_len > kMaxMessage) {
          dropping_ = true;
          message_.clear();
        } else {
          message_.append(data->data_ptr, data->data_len);
        }
      }
      const bool frame_done = data->payload_offset + data->data_len >= data->payload_len;
      if (!frame_done || !data->fin) return;
      if (dropping_) {
        dropping_ = false;
        printf("ignored a message from the backend over 16 KiB\n");
        fflush(stdout);
        return;
      }
      std::string text = std::move(message_);
      message_.clear();
      post([text](core::Device &device) { device.on_link_message(text); });
      return;
    }

    case WEBSOCKET_EVENT_ERROR:
      if (data->error_handle.esp_ws_handshake_status_code != 0) {
        handshake_status_ = data->error_handle.esp_ws_handshake_status_code;
      }
      if (std::string why = describe(data->error_handle); !why.empty()) failure_ = why;
      return;

    case WEBSOCKET_EVENT_DISCONNECTED:
      // For a failed connect, the details come with this event, not ERROR.
      if (std::string why = describe(data->error_handle); !why.empty()) failure_ = why;
      [[fallthrough]];
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
        const std::string why = failure_;
        post([why](core::Device &device) { device.on_link_failed(why); });
      }
      return;
    }

    default:
      return;
  }
}

}  // namespace connection
