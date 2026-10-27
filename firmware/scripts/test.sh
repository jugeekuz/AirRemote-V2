#!/usr/bin/env bash
# Checks that core stays platform-free, then builds and runs every host test.
set -euo pipefail

firmware_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$firmware_dir"

# ESP-IDF exposes its common components (FreeRTOS, log, soc, hal, ...) to
# every component whatever its REQUIRES says, so this check is what keeps
# core free of ESP-IDF and hardware headers. Its tests may use them.
forbidden='^[[:space:]]*#[[:space:]]*include[[:space:]]*[<"](esp_|freertos/|driver/|soc/|hal/|nvs|lwip/|mbedtls/|sdkconfig\.h)'
if hits="$(grep -rnE --exclude-dir=host_test "$forbidden" components/core)"; then
  echo 'core must not include ESP-IDF or hardware headers:' >&2
  echo "$hits" >&2
  exit 1
fi

for test_dir in components/*/host_test; do
  name="$(basename "$(dirname "$test_dir")")"
  echo "== $name"
  scripts/idf.sh -C "$test_dir" build
  scripts/idf.sh exec "$test_dir/build/${name}_host_test.elf"
done
