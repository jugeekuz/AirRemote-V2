#!/usr/bin/env bash
# Development certificates for the device listener. Never use them in production.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/dev-certs.sh [--out DIR] [--force] [--host NAME_OR_IP]...
                                                CA and server certificate
  scripts/dev-certs.sh [--out DIR] device MAC   device certificate (CN = MAC)

  --out DIR   where to write (default: certs/ at the repository root)
  --force     replace the CA too; existing device certificates stop working
  --host      also name this host or IP in the server certificate, e.g. your
              machine's LAN address for a real board (repeatable)

The CA is kept between runs, so device certificates stay valid.
EOF
}

fail() {
  echo "dev-certs: $*" >&2
  exit 1
}

out="$(cd "$(dirname "$0")/.." && pwd)/certs"
force=false
mac=''
hosts=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      [[ $# -ge 2 ]] || fail '--out needs a directory'
      out="$2"
      shift 2
      ;;
    --force)
      force=true
      shift
      ;;
    --host)
      [[ $# -ge 2 && -n "$2" ]] || fail '--host needs a name or an IP address'
      hosts+=("$2")
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    device)
      [[ $# -ge 2 ]] || fail 'device needs a MAC address, e.g. device AA:BB:CC:DD:EE:01'
      mac="$2"
      shift 2
      ;;
    *)
      usage >&2
      fail "unknown argument: $1"
      ;;
  esac
done

command -v openssl >/dev/null || fail 'openssl is not installed'

mkdir -p "$out"
out="$(cd "$out" && pwd)"
ca_crt="$out/device-ca.crt"
ca_key="$out/device-ca.key"

# A minimal config, so OpenSSL adds no default extensions (e.g. CA:TRUE on leaves).
config="$(mktemp)"
trap 'rm -f "$config"' EXIT
printf '[req]\ndistinguished_name = dn\n[dn]\n' >"$config"

key_args=(-newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes)

# openssl, with its progress noise hidden unless it fails.
run_openssl() {
  local log
  log="$(mktemp)"
  if ! openssl "$@" 2>"$log"; then
    cat "$log" >&2
    rm -f "$log"
    fail 'openssl failed (see above)'
  fi
  rm -f "$log"
}

# issue NAME SUBJECT DAYS EXTENSION... — a certificate signed by the CA.
issue() {
  local name="$1" subject="$2" days="$3"
  shift 3
  local extensions=()
  for extension in "$@"; do extensions+=(-addext "$extension"); done
  run_openssl req -x509 -config "$config" "${key_args[@]}" -days "$days" \
    -subj "$subject" -CA "$ca_crt" -CAkey "$ca_key" \
    -keyout "$name.key" -out "$name.crt" \
    -addext 'basicConstraints=critical,CA:FALSE' "${extensions[@]}"
  chmod 0640 "$name.key"
}

if [[ -n "$mac" ]]; then
  [[ "$mac" =~ ^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$ ]] ||
    fail "not a MAC address: $mac (expected AA:BB:CC:DD:EE:FF)"
  [[ -f "$ca_crt" && -f "$ca_key" ]] ||
    fail "no CA in $out; run scripts/dev-certs.sh first"

  mac="$(printf %s "$mac" | tr "[:lower:]" "[:upper:]")"
  mkdir -p "$out/devices"
  device="$out/devices/${mac//:/-}"
  issue "$device" "/CN=$mac" 730 'extendedKeyUsage=clientAuth'
  echo "Device certificate for $mac:"
  echo "  $device.crt"
  echo "  $device.key"
  exit 0
fi

if [[ "$force" == true || ! -f "$ca_crt" || ! -f "$ca_key" ]]; then
  if [[ -f "$ca_crt" ]]; then
    rm -rf "$out/devices"
    echo 'Replaced the device CA: every device certificate issued before is now invalid.'
  fi
  run_openssl req -x509 -config "$config" "${key_args[@]}" -days 3650 \
    -subj '/CN=AirRemote Dev Device CA' \
    -keyout "$ca_key" -out "$ca_crt" \
    -addext 'basicConstraints=critical,CA:TRUE' \
    -addext 'keyUsage=critical,keyCertSign,cRLSign'
  chmod 0640 "$ca_key"
else
  echo "Keeping the existing device CA in $out."
fi

# An IPv4 or IPv6 address is an IP entry; anything else a DNS name.
san='DNS:localhost,IP:127.0.0.1'
for host in "${hosts[@]}"; do
  if [[ "$host" =~ ^[0-9]+(\.[0-9]+){3}$ || "$host" == *:* ]]; then
    san+=",IP:$host"
  else
    san+=",DNS:$host"
  fi
done

issue "$out/device-server" '/CN=localhost' 730 \
  "subjectAltName=$san" 'extendedKeyUsage=serverAuth'

cat <<EOF
Device listener certificates are in $out.
Docker Compose reads them from there. For \`pnpm dev\`, put these in .env:

DEVICE_TLS_CERT_FILE=$out/device-server.crt
DEVICE_TLS_KEY_FILE=$out/device-server.key
DEVICE_TLS_CA_FILE=$out/device-ca.crt

Issue a device certificate with: scripts/dev-certs.sh device AA:BB:CC:DD:EE:01
EOF
