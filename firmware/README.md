# AirRemote firmware

The V2 firmware for the AirRemote board: ESP-IDF in C++. It joins Wi-Fi,
connects to the backend's device listener over mTLS, gets enrolled, and says
`hello`. IR is not there yet: it answers IR commands with `INVALID_COMMAND`.
Everything a person does with it goes through the serial console. The designs
are in `docs/superpowers/specs/2026-10-27-firmware-*-design.md`.

## Setting up a board

From the repository root, with Docker running and the board on USB:

1. `scripts/dev-certs.sh --host <your LAN IP>`: the dev CA, and a server
   certificate the board accepts at that address. Put the printed
   `DEVICE_TLS_*` lines in `.env` and start (or restart) `pnpm dev`.
2. `echo https://<your LAN IP>:8443 > firmware/backend-url.txt` (git-ignored).
3. `firmware/scripts/idf.sh build flash`, then
   `scripts/provision-device.sh` once per board.
4. `firmware/scripts/idf.sh monitor` and type on the console:
   - `wifi <ssid> <password>` (quote values with spaces); it is kept in `nvs`
     and used after every reboot;
   - `pair` when it says `not enrolled — type: pair`; it prints a pairing
     code, valid 15 minutes;
   - enroll it with that code: `POST /devices` as its owner
     (`backend/README.md`, "Enrolling a device");
   - it prints `connected` within seconds, then reconnects by itself after a
     reboot, a lost Wi-Fi or a backend restart.

## The console

| Command                  | Does                                               |
| ------------------------ | -------------------------------------------------- |
| `wifi <ssid> [password]` | saves the network and joins it (empty password: open network) |
| `pair`                   | asks the backend for one pairing code and prints it |
| `status`                 | firmware, MAC, identity, Wi-Fi, backend, pending code |
| `help`                   | lists these                                        |

The board never asks for a pairing code by itself. Not enrolled, it retries
the connection every 30 s; after `pair`, every 5 s until the code expires.

## Prerequisites

- Docker. ESP-IDF (`espressif/idf:v6.0.3`) runs only in the container, through
  `scripts/idf.sh`; nothing ESP-IDF-related is installed on the host.
- The board on USB for flashing. Its port is `/dev/ttyUSB0` unless you set
  `ESPPORT`. The container gets the port's group, so you don't need to join
  `dialout`.

## Commands

Run them from `firmware/`.

```bash
scripts/idf.sh build                     # build the image
scripts/idf.sh flash monitor             # flash it, then show the log (Ctrl+] quits)
scripts/test.sh                          # core's include check, host tests, Linux build
scripts/idf.sh exec esptool chip-id      # chip type, revision and MAC
scripts/idf.sh exec esptool flash-id     # flash size
```

`scripts/idf.sh <args>` runs `idf.py <args>`. `scripts/idf.sh exec <command>`
runs any command in the container.
`idf.py monitor` needs a terminal. `IDF_DOCKER_ARGS` adds `docker run`
options (the e2e tests use it for host networking).

The build embeds `certs/device-ca.crt`, which `idf.sh` mounts read-only (only
that file, never the keys next to it), and reads `backend-url.txt`. Without
the CA the build stops; without the URL the board says so instead of
connecting.

## The Linux build and its tests

`linux/` builds the same `core`, `runtime` and `connection` as a Linux
program, with stand-ins for Wi-Fi (always up), settings (in memory) and the
identity (files). `pnpm test:firmware` (repository root) builds it once and
runs `e2e/*.e2e.ts` against the real device listener over mTLS; `pnpm test`
includes it, `pnpm test:e2e` does not.

`idf.py flash` writes the bootloader, partition table, `otadata` and the app.
It leaves `identity` and `nvs` alone. **`idf.py erase-flash` wipes
everything, including the device's identity**, which then has to be
provisioned again.

## Layout

```
CMakeLists.txt        the project (airremote)
version.txt           the firmware version; bump it by hand
partitions.csv        fixed once boards exist
sdkconfig.defaults    committed; sdkconfig is generated and git-ignored
backend-url.txt       the device listener's address (git-ignored)
main/                 the board's app_main: wires board drivers to core
linux/                the same, as a Linux program for the e2e tests
e2e/                  Vitest tests running linux/ against the device listener
components/
  core/               platform-free: Device (every decision), protocol, console parser
    host_test/        its Unity tests, an ESP-IDF app for the linux target
  runtime/            event queue, timers, console reader (esp32 and linux)
  connection/         the WebSocket and POST /pairing-code over mTLS (esp32 and linux)
  board/              ESP32 only: Wi-Fi, settings in nvs, the identity reader
scripts/              idf.sh (ESP-IDF in Docker), test.sh
```

## Partitions

| Name       | Offset     | Size   | Holds                                         |
| ---------- | ---------- | ------ | --------------------------------------------- |
| `nvs`      | `0x11000`  | 24 KB  | Wi-Fi and settings; wiped by a factory reset  |
| `otadata`  | `0x17000`  | 8 KB   | which app slot boots                          |
| `identity` | `0x19000`  | 12 KB  | the device key and certificate                |
| `nvs_keys` | `0x1C000`  | 4 KB   | reserved for NVS encryption                   |
| `app0`     | `0x20000`  | 4 MB   | app slot `ota_0`                              |
| `app1`     | `0x420000` | 4 MB   | app slot `ota_1`                              |
| `coredump` | `0x820000` | 128 KB | the last crash dump                           |

The table itself is at `0x10000`. Bootloader rollback is on: an image
installed over the air must mark itself valid, or the next boot returns to
the previous one. An image flashed over USB is never rolled back.

## Provisioning

A board needs an identity before it can connect: a private key and a
certificate whose CN is its MAC address, signed by the device CA. From the
repository root, with the board on USB:

```bash
scripts/dev-certs.sh                  # once: the dev CA in certs/
scripts/provision-device.sh           # reads the MAC, writes the identity
```

- `--ca-dir DIR` signs with another CA directory; `--force` replaces an
  identity the board already has.
- It writes only the `identity` partition, reads it back to check it, and
  keeps the certificate in `<ca-dir>/devices/` as a record.
- **The key is deleted from the computer.** After `erase-flash`, provision
  again; the board gets a new key.
- A replaced certificate is not revoked: it still connects for that MAC.

What the firmware reads (never writes):

| NVS namespace | Key    | Type   | Value                             |
| ------------- | ------ | ------ | --------------------------------- |
| `identity`    | `cert` | string | the device certificate, PEM       |
| `identity`    | `key`  | string | its EC P-256 private key, PEM     |

## The board

DFRobot FireBeetle ESP32 (DFR0478). The rest of the circuit is in V1's
`firmware/assets/board/parts-list.csv` (tag `v1-final`).

- Chip: ESP32-D0WD, **revision v1.1**
- Flash: 16 MB (GigaDevice, `c8`/`4018`)

Secure boot and flash encryption stay off on development boards; never burn
eFuses on them. Secure Boot V2 needs chip revision v3.0 or later, so this
board only supports the older Secure Boot V1. Decide on the chip (a v3 ESP32,
or an ESP32-S3/C3) before boards go to other people.
