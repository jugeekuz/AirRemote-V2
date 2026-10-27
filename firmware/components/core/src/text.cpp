#include "core/text.hpp"

#include <array>

namespace core {

namespace {

constexpr int64_t kPairingFallbackMs = 15 * 60 * 1000;

std::optional<int> digits(std::string_view text, size_t at, size_t count) {
  if (at + count > text.size()) return std::nullopt;
  int value = 0;
  for (size_t i = at; i < at + count; i++) {
    if (text[i] < '0' || text[i] > '9') return std::nullopt;
    value = value * 10 + (text[i] - '0');
  }
  return value;
}

// Days since 1970-01-01 (Howard Hinnant's days_from_civil).
int64_t days_from_civil(int64_t y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

std::optional<int64_t> to_ms(int year, int month, int day, int hour, int minute,
                             int second, int ms) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 ||
      second > 60) {
    return std::nullopt;
  }
  const int64_t days = days_from_civil(year, month, day);
  return ((days * 24 + hour) * 60 + minute) * 60000 + second * 1000 + ms;
}

}  // namespace

std::optional<BackendUrls> backend_urls(std::string_view base) {
  constexpr std::string_view kScheme = "https://";
  if (base.substr(0, kScheme.size()) != kScheme) return std::nullopt;
  std::string_view host = base.substr(kScheme.size());
  while (!host.empty() && host.back() == '/') host.remove_suffix(1);
  if (host.empty() || host.find('/') != std::string_view::npos) return std::nullopt;
  const std::string authority(host);
  return BackendUrls{"wss://" + authority + "/ws", "https://" + authority + "/pairing-code"};
}

std::string group_pairing_code(std::string_view code) {
  if (code.size() != 8) return std::string(code);
  return std::string(code.substr(0, 4)) + "-" + std::string(code.substr(4));
}

std::optional<int64_t> parse_iso_utc_ms(std::string_view t) {
  // YYYY-MM-DDTHH:MM:SS[.fff]Z
  if (t.size() < 20 || t[4] != '-' || t[7] != '-' || t[10] != 'T' || t[13] != ':' ||
      t[16] != ':' || t.back() != 'Z') {
    return std::nullopt;
  }
  auto year = digits(t, 0, 4), month = digits(t, 5, 2), day = digits(t, 8, 2);
  auto hour = digits(t, 11, 2), minute = digits(t, 14, 2), second = digits(t, 17, 2);
  if (!year || !month || !day || !hour || !minute || !second) return std::nullopt;
  int ms = 0;
  if (t.size() > 20) {
    if (t[19] != '.' || t.size() < 22) return std::nullopt;
    std::string_view fraction = t.substr(20, t.size() - 21);
    int scale = 100;
    for (char c : fraction) {
      if (c < '0' || c > '9') return std::nullopt;
      ms += (c - '0') * scale;
      scale /= 10;
    }
  }
  return to_ms(*year, *month, *day, *hour, *minute, *second, ms);
}

std::optional<int64_t> parse_http_date_ms(std::string_view t) {
  // Tue, 27 Oct 2026 12:15:00 GMT
  static constexpr std::array<std::string_view, 12> kMonths = {
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  if (t.size() != 29 || t[3] != ',' || t[4] != ' ' || t[7] != ' ' || t[11] != ' ' ||
      t[16] != ' ' || t[19] != ':' || t[22] != ':' || t.substr(25) != " GMT") {
    return std::nullopt;
  }
  int month = 0;
  for (size_t i = 0; i < kMonths.size(); i++) {
    if (t.substr(8, 3) == kMonths[i]) month = static_cast<int>(i) + 1;
  }
  auto day = digits(t, 5, 2), year = digits(t, 12, 4);
  auto hour = digits(t, 17, 2), minute = digits(t, 20, 2), second = digits(t, 23, 2);
  if (!month || !day || !year || !hour || !minute || !second) return std::nullopt;
  return to_ms(*year, month, *day, *hour, *minute, *second, 0);
}

int64_t pairing_lifetime_ms(std::optional<std::string_view> date_header,
                            std::string_view expires_at) {
  auto expires = parse_iso_utc_ms(expires_at);
  auto now = date_header ? parse_http_date_ms(*date_header) : std::nullopt;
  if (!expires || !now) return kPairingFallbackMs;
  return *expires > *now ? *expires - *now : 0;
}

}  // namespace core
