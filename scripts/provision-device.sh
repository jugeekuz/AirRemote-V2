#!/usr/bin/env bash
# Gives the board on USB its identity: a key and a certificate (CN = its MAC)
# from the device CA, written to its identity partition. The key is then
# deleted from this computer; only the board keeps it.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/provision-device.sh [--ca-dir DIR] [--force]

  --ca-dir DIR   the device CA to sign with (default: certs/ at the repository
                 root, made by scripts/dev-certs.sh)
  --force        replace an identity the board already has

The board is on ESPPORT (default /dev/ttyUSB0). Its certificate is kept in
DIR/devices/ as a record; its key is not.
EOF
}

fail() {
  echo "provision-device: $*" >&2
  exit 1
}

repo="$(cd "$(dirname "$0")/.." && pwd)"
firmware="$repo/firmware"
ca_dir="$repo/certs"
force=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ca-dir)
      [[ $# -ge 2 ]] || fail '--ca-dir needs a directory'
      ca_dir="$2"
      shift 2
      ;;
    --force)
      force=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "unknown argument: $1"
      ;;
  esac
done

# Tests replace idf.sh with a fake board.
idf="${PROVISION_IDF_SH:-$firmware/scripts/idf.sh}"
port="${ESPPORT:-/dev/ttyUSB0}"

command -v openssl >/dev/null || fail 'openssl is not installed'
command -v python3 >/dev/null || fail 'python3 is not installed'
[[ -f "$ca_dir/device-ca.crt" && -f "$ca_dir/device-ca.key" ]] ||
  fail "no CA in $ca_dir; run scripts/dev-certs.sh first"
ca_dir="$(cd "$ca_dir" && pwd)"
if [[ -z "${PROVISION_IDF_SH:-}" && ! -e "$port" ]]; then
  fail "no board on $port; plug it in or set ESPPORT"
fi

# partitions.csv is the only place the identity partition is defined.
read -r offset size < <(awk -F, '{ gsub(/[[:space:]]/, "") }
  $1 == "identity" { print $4, $5 }' "$firmware/partitions.csv") ||
  fail 'no identity partition in firmware/partitions.csv'

# The container sees only firmware/, so every file it touches lives here.
# This folder holds the key (as PEM, in identity.bin and in the read-backs).
mkdir -p "$firmware/build"
tmp="$(mktemp -d "$firmware/build/provision-XXXXXX")"
rel="build/$(basename "$tmp")"

succeeded=false
record='' # the certificate record, once this run has issued one
key=''

# The key goes first, and nothing here may stop the rest: set -e would end the
# trap at the first failing command.
cleanup() {
  set +e
  [[ -n "$key" ]] && rm -f "$key"
  local previous=''
  if [[ -f "$tmp/previous.crt" ]]; then
    previous="$(cat "$tmp/previous.crt")"
  fi
  rm -rf "$tmp"
  if [[ "$succeeded" != true && -n "$record" ]]; then
    if [[ -n "$previous" ]]; then
      printf '%s\n' "$previous" >"$record" ||
        echo "provision-device: could not restore $record" >&2
    else
      rm -f "$record"
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# in_idf WHAT COMMAND... — runs in the ESP-IDF container; output in $tmp/out.
in_idf() {
  local what="$1"
  shift
  if ! "$idf" exec "$@" >"$tmp/out" 2>&1; then
    cat "$tmp/out" >&2
    fail "$what failed (see above)"
  fi
}

in_idf 'reading the MAC address' esptool read-mac
mac="$(grep -oE 'MAC:[[:space:]]+([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}' "$tmp/out" |
  head -n 1 | awk '{ print toupper($2) }')"
[[ -n "$mac" ]] || fail 'could not read the MAC address from the board'

in_idf 'reading the identity partition' \
  esptool read-flash "$offset" "$size" "$rel/before.bin"
# ESP-IDF's parser can crash on another firmware's leftovers. An identity this
# script wrote always parses, so a region it crashes on holds none: but only a
# crash of the parser itself (a Python traceback) says that, and only if the
# region doesn't even contain the namespace name. Anything else (the container
# not starting, the tool missing) could hide an identity, so it stops.
if ! "$idf" exec bash -c \
  "python \"\$IDF_PATH/components/nvs_flash/nvs_partition_tool/nvs_tool.py\" \
    -f json -d minimal $rel/before.bin > $rel/before.json" >"$tmp/out" 2>&1; then
  if grep -q '^Traceback' "$tmp/out" && ! grep -aq identity "$tmp/before.bin"; then
    echo 'provision-device: the identity partition holds no NVS data; treating it as empty' >&2
    echo '[]' >"$tmp/before.json"
  else
    cat "$tmp/out" >&2
    fail 'could not read the identity partition (see above); nothing was changed'
  fi
fi
# Blank flash or another firmware's leftovers parse to no identity entries.
has_identity="$(python3 - "$tmp/before.json" "$tmp/existing.crt" <<'EOF'
import json, sys
entries = [e for e in json.load(open(sys.argv[1])) if e.get('namespace') == 'identity']
for entry in entries:
    if entry.get('key') == 'cert':
        open(sys.argv[2], 'w').write(entry.get('data', ''))
print('yes' if any(e.get('key') in ('cert', 'key') for e in entries) else 'no')
EOF
)"
if [[ "$has_identity" == yes && "$force" != true ]]; then
  existing='unknown'
  if [[ -s "$tmp/existing.crt" ]]; then
    existing="$(openssl x509 -noout -fingerprint -sha256 -in "$tmp/existing.crt" |
      cut -d= -f2)" || existing='unreadable'
  fi
  echo "provision-device: the board already has an identity (certificate SHA256 $existing); --force replaces it on the board" >&2
  echo 'provision-device: the old certificate is not revoked: it still connects for this MAC' >&2
  exit 1
fi

dashed="${mac//:/-}"
crt="$ca_dir/devices/$dashed.crt"
[[ -f "$crt" ]] && cp "$crt" "$tmp/previous.crt"
record="$crt"
key="$ca_dir/devices/$dashed.key"
# Its output names the key file, which is about to be deleted.
"$repo/scripts/dev-certs.sh" --out "$ca_dir" device "$mac" >/dev/null

cp "$crt" "$tmp/cert.pem"
cp "$key" "$tmp/key.pem"
cat >"$tmp/identity.csv" <<EOF
key,type,encoding,value
identity,namespace,,
cert,file,string,/project/$rel/cert.pem
key,file,string,/project/$rel/key.pem
EOF
in_idf 'building the identity image' python -m esp_idf_nvs_partition_gen \
  generate "$rel/identity.csv" "$rel/identity.bin" "$size"

in_idf 'writing the identity partition' \
  esptool write-flash "$offset" "$rel/identity.bin"
in_idf 'reading the identity partition back' \
  esptool read-flash "$offset" "$size" "$rel/after.bin"
cmp -s "$tmp/identity.bin" "$tmp/after.bin" ||
  fail "the board's identity could not be confirmed; run again with --force"

succeeded=true
fingerprint="$(openssl x509 -noout -fingerprint -sha256 -in "$crt" | cut -d= -f2)"
cat <<EOF
Provisioned $mac.
  certificate: $crt
  SHA-256:     $fingerprint
The key is on the board only.
Next: enroll the device.
EOF
