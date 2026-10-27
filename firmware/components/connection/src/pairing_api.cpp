#include "connection/pairing_api.hpp"

#include <optional>

#include <strings.h>

#include "core/protocol.hpp"
#include "core/text.hpp"
#include "esp_http_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace connection {

namespace {

struct Response {
  std::optional<std::string> date;
};

esp_err_t on_http_event(esp_http_client_event_t *event) {
  auto *response = static_cast<Response *>(event->user_data);
  if (event->event_id == HTTP_EVENT_ON_HEADER && event->header_key &&
      strcasecmp(event->header_key, "date") == 0 && event->header_value) {
    response->date = event->header_value;
  }
  return ESP_OK;
}

}  // namespace

HttpPairingApi::HttpPairingApi(std::string url, const TlsMaterial &tls,
                               runtime::EventQueue &queue)
    : url_(std::move(url)), tls_(tls), queue_(queue) {}

void HttpPairingApi::request() {
  if (xTaskCreate(&HttpPairingApi::run, "pairing", 8192, this, 5, nullptr) != pdPASS) {
    core::Device *device = device_;
    queue_.post([device] { device->on_pairing_failed("out of memory"); });
  }
}

void HttpPairingApi::run(void *self) {
  static_cast<HttpPairingApi *>(self)->perform();
  vTaskDelete(nullptr);
}

void HttpPairingApi::perform() {
  core::Device *device = device_;
  auto fail = [this, device](std::string reason) {
    queue_.post([device, reason] { device->on_pairing_failed(reason); });
  };

  Response response;
  esp_http_client_config_t config = {};
  config.url = url_.c_str();
  config.method = HTTP_METHOD_POST;
  config.cert_pem = tls_.server_ca.c_str();
  config.client_cert_pem = tls_.cert.c_str();
  config.client_key_pem = tls_.key.c_str();
  config.timeout_ms = 10000;
  config.event_handler = on_http_event;
  config.user_data = &response;

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (!client) return fail("could not start the request");

  std::string body;
  int status = 0;
  if (esp_http_client_open(client, 0) == ESP_OK) {
    esp_http_client_fetch_headers(client);
    status = esp_http_client_get_status_code(client);
    char buffer[256];
    int read;
    while ((read = esp_http_client_read(client, buffer, sizeof(buffer))) > 0 &&
           body.size() < 2048) {
      body.append(buffer, read);
    }
  }
  esp_http_client_cleanup(client);

  if (status == 0) return fail("backend unreachable");
  if (status == 409) return fail("this device is already enrolled");
  if (status != 201) return fail("HTTP " + std::to_string(status));
  auto pairing = core::decode_pairing_response(body);
  if (!pairing) return fail("unexpected response");

  std::optional<std::string_view> date;
  if (response.date) date = *response.date;
  const int64_t lifetime = core::pairing_lifetime_ms(date, pairing->expires_at);
  const std::string code = pairing->code;
  queue_.post([device, code, lifetime] { device->on_pairing_code(code, lifetime); });
}

}  // namespace connection
