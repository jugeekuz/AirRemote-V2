#pragma once

#include <optional>
#include <string>

namespace board {

struct Identity {
  std::string cert;  // PEM
  std::string key;   // PEM
};

// The key and certificate scripts/provision-device.sh wrote to the identity
// partition (namespace identity, keys cert and key). Read-only: on any error
// it reports "not provisioned" and never erases the partition.
std::optional<Identity> read_identity();

}  // namespace board
