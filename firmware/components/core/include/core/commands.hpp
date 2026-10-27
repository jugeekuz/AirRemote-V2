#pragma once

#include <string>
#include <string_view>

namespace core {

struct WifiCredentials {
  std::string ssid;
  std::string password;  // empty: an open network
};

// A line typed on the console.
struct Command {
  enum class Kind { Wifi, Pair, Status, Help, Ir, Invalid };
  Kind kind = Kind::Invalid;
  WifiCredentials wifi;  // Kind::Wifi
  std::string error;     // Kind::Invalid: the line to print; empty prints nothing
};

// `wifi <ssid> [password]` (double quotes around values with spaces, \" inside
// them), `pair`, `status`, `ir`, `help`.
Command parse_command(std::string_view line);

// The lines `help` prints.
extern const char *const kHelpLines[];

}  // namespace core
