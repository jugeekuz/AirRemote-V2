#!/usr/bin/env bash
# A stand-in for firmware/scripts/idf.sh with a fake board on the port: it
# answers esptool's read-mac, read-flash and write-flash from FAKE_FLASH (the
# board's identity partition) and runs everything else in the real ESP-IDF
# container, never with a serial port.
#
#   FAKE_FLASH             the identity partition's bytes
#   FAKE_MAC               what read-mac reports, e.g. aa:bb:cc:dd:ee:07
#   FAKE_CORRUPT_READBACK  1: a read after a write returns flipped bytes
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
firmware="$repo/firmware"

fail() {
  echo "fake board: $*" >&2
  exit 1
}

# The identity row of partitions.csv: offset and size.
read -r offset size < <(awk -F, '{ gsub(/[[:space:]]/, "") }
  $1 == "identity" { print $4, $5 }' "$firmware/partitions.csv")

expect_region() {
  [[ "$1" == "$offset" && "${2:-$size}" == "$size" ]] ||
    fail "only the identity partition ($offset, $size) exists here, not $1 ${2:-}"
}

if [[ "${1:-}" == exec && "${2:-}" == esptool ]]; then
  : "${FAKE_FLASH:?}" "${FAKE_MAC:?}"
  written="$FAKE_FLASH.written"
  case "${3:-}" in
    read-mac)
      echo "MAC:                $FAKE_MAC"
      ;;
    read-flash)
      expect_region "$4" "$5"
      if [[ "${FAKE_CORRUPT_READBACK:-}" == 1 && -e "$written" ]]; then
        python3 -c 'import sys
data = open(sys.argv[1], "rb").read()
open(sys.argv[2], "wb").write(bytes(b ^ 0xFF for b in data))' "$FAKE_FLASH" "$firmware/$6"
      else
        cp "$FAKE_FLASH" "$firmware/$6"
      fi
      ;;
    write-flash)
      expect_region "$4"
      cp "$firmware/$5" "$FAKE_FLASH"
      touch "$written"
      ;;
    *)
      fail "esptool ${3:-} is not faked"
      ;;
  esac
  exit 0
fi

ESPPORT=/nonexistent exec "$firmware/scripts/idf.sh" "$@"
