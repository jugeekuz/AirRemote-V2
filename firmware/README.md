# AirRemote firmware

The V2 firmware for the AirRemote board: ESP-IDF in C++. It has no features
yet. The design is in
`docs/superpowers/specs/2026-10-27-firmware-scaffold-design.md`.

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
scripts/test.sh                          # core's include check, then every host test
scripts/idf.sh exec esptool chip-id      # chip type, revision and MAC
scripts/idf.sh exec esptool flash-id     # flash size
```

`scripts/idf.sh <args>` runs `idf.py <args>`. `scripts/idf.sh exec <command>`
runs any command in the container.
`idf.py monitor` needs a terminal; in a script, read the port another way.

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
main/                 app_main: wires drivers to core
components/core/      platform-free logic, tested on the host
  host_test/          its Unity tests, an ESP-IDF app for the linux target
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

## The board

DFRobot FireBeetle ESP32 (DFR0478). The rest of the circuit is in V1's
`firmware/assets/board/parts-list.csv` (tag `v1-final`).

- Chip: ESP32-D0WD, **revision v1.1**
- Flash: 16 MB (GigaDevice, `c8`/`4018`)

Secure boot and flash encryption stay off on development boards; never burn
eFuses on them. Secure Boot V2 needs chip revision v3.0 or later, so this
board only supports the older Secure Boot V1. Decide on the chip (a v3 ESP32,
or an ESP32-S3/C3) before boards go to other people.
