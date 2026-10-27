#!/usr/bin/env bash
# Runs ESP-IDF in Docker, so nothing ESP-IDF-related is installed on the host.
set -euo pipefail

usage() {
  cat <<'EOF_USAGE'
Usage:
  scripts/idf.sh <idf.py arguments>   e.g. build, flash monitor, -C <dir> build
  scripts/idf.sh exec <command>       any command, e.g. exec esptool.py chip_id

Runs in firmware/ inside the ESP-IDF image. Set ESPPORT for a port other
than /dev/ttyUSB0; it is passed to the container only when it exists.
IDF_DOCKER_ARGS adds docker run options (split on spaces).
EOF_USAGE
}

IDF_IMAGE=espressif/idf:v6.0.3

case "${1:-}" in
  '' | -h | --help)
    usage
    exit 0
    ;;
esac

firmware_dir="$(cd "$(dirname "$0")/.." && pwd)"
port="${ESPPORT:-/dev/ttyUSB0}"

# :Z relabels the mount for SELinux. Running as the host user keeps build/
# and sdkconfig owned by you; HOME must then be somewhere writable.
args=(--rm -v "$firmware_dir:/project:Z" -w /project
  -u "$(id -u):$(id -g)" -e HOME=/tmp)

# stdin always reaches the container (tests pipe console lines in); a TTY only
# when there is one.
args+=(-i)
if [[ -t 0 && -t 1 ]]; then
  args+=(-t)
fi

# The firmware embeds the CA that signed the device listener's certificate.
# Only that certificate is visible to the container, never the keys beside it.
ca="$firmware_dir/../certs/device-ca.crt"
if [[ -f "$ca" ]]; then
  args+=(-v "$(cd "$(dirname "$ca")" && pwd)/device-ca.crt:/certs/device-ca.crt:ro,z")
fi

# Extra docker run options, e.g. "--network host --name x -e KEY=value".
if [[ -n "${IDF_DOCKER_ARGS:-}" ]]; then
  read -r -a extra <<<"$IDF_DOCKER_ARGS"
  args+=("${extra[@]}")
fi

# The port's group, not membership of dialout on the host, gives access.
if [[ -e "$port" ]]; then
  args+=(--device "$port" --group-add "$(stat -c %g "$port")"
    -e ESPPORT="$port" -e ESPTOOL_PORT="$port")
fi

if [[ "$1" == exec ]]; then
  shift
  exec docker run "${args[@]}" "$IDF_IMAGE" "$@"
fi

exec docker run "${args[@]}" "$IDF_IMAGE" idf.py "$@"
