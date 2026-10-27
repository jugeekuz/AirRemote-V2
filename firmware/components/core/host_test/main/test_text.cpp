#include <unity.h>

#include "core/text.hpp"

TEST_CASE("backend_urls derives the WebSocket and pairing URLs", "[text]") {
  for (const char *base : {"https://192.168.1.10:8443", "https://192.168.1.10:8443/"}) {
    auto urls = core::backend_urls(base);
    TEST_ASSERT_TRUE(urls.has_value());
    TEST_ASSERT_EQUAL_STRING("wss://192.168.1.10:8443/ws", urls->websocket.c_str());
    TEST_ASSERT_EQUAL_STRING("https://192.168.1.10:8443/pairing-code", urls->pairing.c_str());
  }
  TEST_ASSERT_FALSE(core::backend_urls("http://192.168.1.10:8443").has_value());
  TEST_ASSERT_FALSE(core::backend_urls("").has_value());
  TEST_ASSERT_FALSE(core::backend_urls("garbage").has_value());
  TEST_ASSERT_FALSE(core::backend_urls("https://").has_value());
}

TEST_CASE("group_pairing_code splits the code in two", "[text]") {
  TEST_ASSERT_EQUAL_STRING("7K4M-Q9TX", core::group_pairing_code("7K4MQ9TX").c_str());
  TEST_ASSERT_EQUAL_STRING("ABC", core::group_pairing_code("ABC").c_str());
}

TEST_CASE("parses an ISO UTC time and an HTTP date to epoch ms", "[text]") {
  // 2026-10-27T12:15:00Z
  const int64_t expected = 1793103300000;
  TEST_ASSERT_EQUAL_INT64(expected, *core::parse_iso_utc_ms("2026-10-27T12:15:00.000Z"));
  TEST_ASSERT_EQUAL_INT64(expected, *core::parse_iso_utc_ms("2026-10-27T12:15:00Z"));
  TEST_ASSERT_EQUAL_INT64(expected + 250, *core::parse_iso_utc_ms("2026-10-27T12:15:00.250Z"));
  TEST_ASSERT_EQUAL_INT64(expected, *core::parse_http_date_ms("Tue, 27 Oct 2026 12:15:00 GMT"));
  TEST_ASSERT_EQUAL_INT64(951782400000, *core::parse_iso_utc_ms("2000-02-29T00:00:00Z"));
  TEST_ASSERT_FALSE(core::parse_iso_utc_ms("2026-10-27 12:15:00").has_value());
  TEST_ASSERT_FALSE(core::parse_iso_utc_ms("2026-13-01T00:00:00Z").has_value());
  TEST_ASSERT_FALSE(core::parse_http_date_ms("yesterday").has_value());
  TEST_ASSERT_FALSE(core::parse_http_date_ms("Tue, 27 Foo 2026 12:15:00 GMT").has_value());
}

TEST_CASE("pairing_lifetime_ms uses the server's Date, else 15 min", "[text]") {
  const char *expires = "2026-10-27T12:15:00.000Z";
  TEST_ASSERT_EQUAL_INT64(900000,
                          core::pairing_lifetime_ms("Tue, 27 Oct 2026 12:00:00 GMT", expires));
  TEST_ASSERT_EQUAL_INT64(300000,
                          core::pairing_lifetime_ms("Tue, 27 Oct 2026 12:10:00 GMT", expires));
  TEST_ASSERT_EQUAL_INT64(900000, core::pairing_lifetime_ms(std::nullopt, expires));
  TEST_ASSERT_EQUAL_INT64(900000, core::pairing_lifetime_ms("nonsense", expires));
  TEST_ASSERT_EQUAL_INT64(900000, core::pairing_lifetime_ms("Tue, 27 Oct 2026 12:00:00 GMT", "nope"));
  TEST_ASSERT_EQUAL_INT64(0, core::pairing_lifetime_ms("Tue, 27 Oct 2026 12:20:00 GMT", expires));
}
