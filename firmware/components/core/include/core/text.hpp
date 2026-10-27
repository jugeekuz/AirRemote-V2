#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace core {

struct BackendUrls {
  std::string websocket;  // wss://host:port/ws
  std::string pairing;    // https://host:port/pairing-code
};

// From the device listener's base URL, e.g. https://192.168.1.10:8443.
std::optional<BackendUrls> backend_urls(std::string_view base);

// 7K4MQ9TX -> 7K4M-Q9TX, as it's typed when enrolling.
std::string group_pairing_code(std::string_view code);

// 2026-10-27T12:15:00.000Z (fraction optional) -> ms since the epoch.
std::optional<int64_t> parse_iso_utc_ms(std::string_view text);
// Tue, 27 Oct 2026 12:15:00 GMT -> ms since the epoch.
std::optional<int64_t> parse_http_date_ms(std::string_view text);

// How long a pairing code lives: `expires_at` minus the response's Date
// header, so both come from the server's clock (the device has none). 15 min,
// the backend's TTL, when either can't be read. Never negative.
int64_t pairing_lifetime_ms(std::optional<std::string_view> date_header,
                            std::string_view expires_at);

}  // namespace core
