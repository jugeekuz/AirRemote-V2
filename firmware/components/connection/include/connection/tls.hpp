#pragma once

#include <string>

namespace connection {

// PEM text. The server CA verifies the device listener; the certificate and
// key are the device's identity.
struct TlsMaterial {
  std::string server_ca;
  std::string cert;
  std::string key;
};

}  // namespace connection
