#include "core/commands.hpp"

#include <optional>
#include <vector>

namespace core {

const char *const kHelpLines[] = {
    "wifi <ssid> [password]  join a Wi-Fi network (quote values with spaces)",
    "pair                    get a pairing code to enroll this device",
    "status                  what the device knows",
    "help                    this list",
    nullptr,
};

namespace {

constexpr size_t kMaxLine = 200;
constexpr size_t kMaxSsid = 32;
constexpr size_t kMinPassword = 8;
constexpr size_t kMaxPassword = 63;
constexpr const char *kWifiUsage =
    "usage: wifi <ssid> [password] — SSID 1–32 bytes, password empty or 8–63 characters";

bool is_space(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

// Splits on spaces; "..." groups, with \" for a quote. nullopt: unterminated.
std::optional<std::vector<std::string>> tokenize(std::string_view line) {
  std::vector<std::string> tokens;
  size_t i = 0;
  while (i < line.size()) {
    while (i < line.size() && is_space(line[i])) i++;
    if (i == line.size()) break;
    std::string token;
    if (line[i] == '"') {
      i++;
      bool closed = false;
      while (i < line.size()) {
        if (line[i] == '\\' && i + 1 < line.size() && line[i + 1] == '"') {
          token += '"';
          i += 2;
        } else if (line[i] == '"') {
          closed = true;
          i++;
          break;
        } else {
          token += line[i++];
        }
      }
      if (!closed) return std::nullopt;
    } else {
      while (i < line.size() && !is_space(line[i])) token += line[i++];
    }
    tokens.push_back(token);
  }
  return tokens;
}

Command invalid(std::string error) {
  Command command;
  command.error = std::move(error);
  return command;
}

Command simple(Command::Kind kind, const std::vector<std::string> &tokens) {
  if (tokens.size() != 1) return invalid("usage: " + tokens[0]);
  Command command;
  command.kind = kind;
  return command;
}

}  // namespace

Command parse_command(std::string_view line) {
  if (line.size() > kMaxLine) return invalid("line too long");
  auto tokens = tokenize(line);
  if (!tokens) return invalid("unterminated quote");
  if (tokens->empty()) return invalid("");

  const std::string &name = (*tokens)[0];
  if (name == "pair") return simple(Command::Kind::Pair, *tokens);
  if (name == "status") return simple(Command::Kind::Status, *tokens);
  if (name == "help") return simple(Command::Kind::Help, *tokens);
  if (name != "wifi") return invalid("unknown command: " + name + " — type help");

  if (tokens->size() < 2 || tokens->size() > 3) return invalid(kWifiUsage);
  Command command;
  command.kind = Command::Kind::Wifi;
  command.wifi.ssid = (*tokens)[1];
  if (tokens->size() == 3) command.wifi.password = (*tokens)[2];
  const size_t password = command.wifi.password.size();
  if (command.wifi.ssid.empty() || command.wifi.ssid.size() > kMaxSsid ||
      (password != 0 && (password < kMinPassword || password > kMaxPassword))) {
    return invalid(kWifiUsage);
  }
  return command;
}

}  // namespace core
