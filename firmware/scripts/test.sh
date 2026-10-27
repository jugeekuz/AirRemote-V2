#!/usr/bin/env bash
# Checks that core stays platform-free, then builds and runs every host test.
set -euo pipefail

firmware_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$firmware_dir"

# ESP-IDF exposes its common components (FreeRTOS, log, soc, hal, ...) to
# every component whatever its REQUIRES says, so this check is what keeps
# core free of ESP-IDF and hardware headers. Its tests may use them.
forbidden='^[[:space:]]*#[[:space:]]*include[[:space:]]*[<"](esp_|freertos/|driver/|soc/|hal/|rom/|xtensa/|esp32/|nvs|lwip/|mbedtls/|heap_caps|multi_heap|sdkconfig\.h|(FreeRTOS|task|queue|semphr|timers|event_groups)\.h)'
core_dir=components/core
# grep exits 1 for no match but 2 for an error (e.g. core moved), which must
# not pass as "no match".
hits="$(grep -rnE --exclude-dir=host_test --include='*.[ch]' --include='*.[ch]pp' --include='*.cc' \
  "$forbidden" "$core_dir")" && status=0 || status=$?
if ((status == 0)); then
  echo 'core must not include ESP-IDF or hardware headers:' >&2
  echo "$hits" >&2
  exit 1
elif ((status > 1)); then
  echo "include check failed: could not search $core_dir" >&2
  exit 1
fi

for test_dir in components/*/host_test; do
  name="$(basename "$(dirname "$test_dir")")"
  echo "== $name"
  scripts/idf.sh -C "$test_dir" build
  # Whatever the project is called, its program is the one ELF in build/.
  elf=("$test_dir"/build/*.elf)
  [[ ${#elf[@]} -eq 1 && -f "${elf[0]}" ]] || { echo "no single ELF in $test_dir/build" >&2; exit 1; }
  scripts/idf.sh exec "${elf[0]}"
done

# The Linux app must keep building too; firmware/e2e runs it (pnpm test:firmware).
echo "== linux"
scripts/idf.sh -C linux build >/dev/null
