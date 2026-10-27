# Firmware foundations and scaffold — design

Date: 2026-10-27 · Branch: a new branch off `main`

## Intent

The V2 firmware is about to be written from scratch for the board V1 used
(DFRobot FireBeetle ESP32, DFR0478, 16 MB flash; IR LEDs behind a transistor,
a TSOP38238 IR receiver, a button, two LEDs; see
`legacy/firmware/assets/board/parts-list.csv`). Before any feature, the owner
wants two things settled:

1. **How the firmware is tested**, so the code is structured for it from the
   first line.
2. **Everything that can only be changed by reflashing a board over USB**: the
   partition table, the bootloader and eFuses. A board in the field can be
   updated over the air (OTA) later only if these were right on its first
   flash.

This change writes those decisions down and builds a `firmware/` project that
already follows them. It has no features: no Wi-Fi, no WebSocket, no IR. Those
come one feature at a time, the way the backend was built.

V1 (Arduino, `legacy/firmware`) had no tests and is not a template. Take its
behaviour and hardware facts from it, nothing else (see `CLAUDE.md`).

## Decided by the owner

### Framework and IR

- **ESP-IDF**, not Arduino or Rust.
- **No IR library.** The device only captures and replays raw pulse timings
  through the ESP32's RMT peripheral (RX records timings, TX plays them back on
  a 38 kHz carrier). It never decodes a protocol; the backend may decode later.
  This matches the protocol already in `@airremote/contracts`
  (`irTimingsSchema`, `readIr`/`sendIr`).

### Testing layers

1. **Host unit tests, which make up most of the tests.** Logic lives in a
   platform-free core that reaches hardware, the clock, storage and the
   network only through small interfaces (a hardware abstraction layer). Tests
   replace those with fakes and run on the developer's machine.
2. **Host integration (later).** The core, built as a Linux program, connects
   to the real backend's device listener, so the firmware's protocol code is
   tested against the real backend.
3. **Simulation (optional, later).** Wokwi smoke tests of the full image.
4. **A manual hardware checklist** before releases, for what only physics
   answers (IR range, carrier accuracy, power, real Wi-Fi).

This change sets up layer 1 only.

### OTA groundwork now, the OTA feature later

1. **A partition table with two equal app slots** (`ota_0`, `ota_1`) and
   `otadata`.
2. **Bootloader rollback on** (`CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`). The
   app marks its image valid once it has started successfully; an image that
   never does is rolled back on the next boot.
3. **The device reports its firmware version** to the backend. *Not in this
   change*: the protocol has no message for it yet (there is no hello). It
   comes with the first firmware feature that connects.
4. **No secure boot and no flash encryption on development boards**, and no
   eFuse is burned casually. They are decided before a board goes to someone
   else.

### Device identity and provisioning ("option A")

- A device's identity is an EC P-256 key and a certificate with `CN = MAC`,
  signed by the device CA, exactly what `scripts/dev-certs.sh device <MAC>`
  issues. The backend identifies devices by that CN
  (`backend/src/shared/device-certificate.ts`).
- A provision script on the developer's machine (*not in this change*) reads
  the MAC (`esptool read_mac`), issues the key and certificate, packs them into
  an NVS partition image with `nvs_partition_gen.py` and writes it to the
  **`identity` partition**.
- `identity` is its own partition, separate from the `nvs` that holds Wi-Fi and
  settings, so a factory reset (wiping `nvs`) and app flashes never touch it.
  `idf.py flash` does not write it; only `erase-flash` wipes it.
- Firmware without an identity enters a visible "not provisioned" state
  (*later*, with the feature that connects).
- What is not in `identity`: the server CA (built into the firmware), the
  backend address (a Kconfig setting per environment) and Wi-Fi credentials
  (entered by the user at setup, stored in `nvs`).
- Option B (the key generated on the device, with the host only signing a
  CSR) comes later, together with flash encryption, once boards go to other
  people.

### Scaffold

- **C++** for `main` and every component, with exceptions and RTTI off
  (ESP-IDF's defaults). Hardware interfaces are small abstract classes; test
  fakes are subclasses of them.

- The toolchain runs in **Espressif's Docker image**, pinned to one version,
  behind a wrapper script. Nothing ESP-IDF-related is installed on the host.
- The owner has the board and expects the scaffold to be flashed and checked
  on it.

## Goals

- `firmware/` is an ESP-IDF project that builds an image for the FireBeetle.
- The partition table, the bootloader settings and the flash settings are the
  final ones described below, so no later change needs a USB reflash of every
  board for them.
- A platform-free `core` component, and a host test runner that builds it for
  ESP-IDF's Linux target and runs its Unity tests with one command.
- The rule "core never touches hardware" is checked by the host test
  command, not only written down.
- `app_main` logs the firmware version and marks the image valid.
- The decisions above are written into the repository: a "Firmware
  conventions" section in `CLAUDE.md` and a `firmware/README.md` with the
  commands.
- Verified on the real board: it flashes, boots, logs the version and the
  partition table, and survives a reflash.

## Non-goals

- No Wi-Fi, WebSocket, mTLS, IR, button or LED code.
- No provision script, no `identity` reader.
- No `firmwareVersion` protocol or backend change.
- No CI: the repository has no `.github/workflows` yet.
- No Wokwi, no QEMU, no on-device (target) Unity tests.
- No secure boot, flash encryption or eFuse changes.
- No `pnpm` integration: the firmware is not part of the pnpm workspace and
  `pnpm test` does not run its tests.
- `legacy/firmware` stays. It is deleted in its own commit when V2 replaces
  it, which this change does not.

## Anti-goals

- ESP-IDF, CMake or a cross-compiler installed on the host as a requirement.
- `core` able to include an `esp_*`, `driver/*` or FreeRTOS header.
- Anything burned into eFuses.
- A placeholder that pretends to be a feature (fake Wi-Fi, a stub WebSocket).
- Copying V1's structure, Arduino libraries or its `default_16MB.csv` as is.

## Constraints

- `CLAUDE.md`: never edit, import or build from `legacy/`; keep `legacy/` out
  of new tooling. Add `firmware` to `.dockerignore` so the backend's Docker
  build context stays the same.
- The host is Fedora with SELinux, Docker available, the user in the `docker`
  group but **not** in `dialout`. Volume mounts need the SELinux relabel
  option; files the container writes must belong to the host user, not root.
- The board is not plugged in yet (no `/dev/ttyUSB*`). It probably appears as
  `/dev/ttyUSB0` through a USB-serial chip.

## The design

### Layout

```
firmware/
  CMakeLists.txt          project; components/ found automatically
  version.txt             the firmware version, e.g. 0.1.0
  partitions.csv
  sdkconfig.defaults      committed; sdkconfig itself is not
  main/                   app_main: wires drivers to core; the only place both meet
  components/
    core/                 platform-free logic; REQUIRES nothing hardware-related
      include/core/…
      src/…
      host_test/          ESP-IDF app for the linux target with core's Unity tests
  scripts/idf.sh          runs idf.py (or esptool) in the pinned Docker image
  scripts/test.sh         checks core's includes, then builds and runs every host_test
  README.md
```

Driver components (`components/ir`, `components/wifi`, …) come with their
features. They implement interfaces that `core` declares.

### Partition table (`partitions.csv`) — final

**One table for every board**, development and production alike, so a single
app image (and later a single OTA image) fits all of them. The app finds the
table at the offset it was built with, so the offset must be shared too.

The partition table offset moves from the default `0x8000` to **`0x10000`**
(`CONFIG_PARTITION_TABLE_OFFSET`). With secure boot and flash encryption the
bootloader can outgrow the default 28 KB slot. Turning those on always needs
USB anyway, since the ESP32 cannot update its bootloader over the air. The
point is that a secured board still uses the same table and the same app
images. My call.

`nvs_keys` is reserved now. The classic ESP32 has no HMAC peripheral, so
encrypting `nvs` and `identity` later (option B with flash encryption) needs
it. It is unused until then. My call.

| Name       | Type | SubType  | Offset     | Size       | Why                                      |
| ---------- | ---- | -------- | ---------- | ---------- | ---------------------------------------- |
| `nvs`      | data | nvs      | `0x11000`  | `0x6000`   | Wi-Fi and settings; wiped by a factory reset |
| `otadata`  | data | ota      | `0x17000`  | `0x2000`   | which app slot boots                     |
| `identity` | data | nvs      | `0x19000`  | `0x3000`   | key and certificate; the NVS minimum size |
| `nvs_keys` | data | nvs_keys | `0x1C000`  | `0x1000`   | reserved for NVS encryption (option B)   |
| `app0`     | app  | ota_0    | `0x20000`  | `0x400000` | 4 MB                                     |
| `app1`     | app  | ota_1    | `0x420000` | `0x400000` | 4 MB                                     |
| `coredump` | data | coredump | `0x820000` | `0x20000`  | crash dumps; 128 KB leaves room for Wi-Fi and TLS tasks |

About 7.7 MB stays unallocated for later. No SPIFFS: nothing needs files. The
builder may adjust the sizes if ESP-IDF rejects them, keeping the order, the
names, `identity` separate from `nvs`, and two equal app slots.

### `sdkconfig.defaults`

- Target `esp32`, 16 MB flash.
- Custom partition table `partitions.csv`, offset `0x10000`.
- `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`.
- Core dumps to flash, ELF format.
- C++ exceptions and RTTI stay at ESP-IDF's defaults (off).

### Version

`firmware/version.txt` holds the version (`0.1.0` to start); ESP-IDF reads it
as `PROJECT_VER`, so it appears in the image header OTA will read later. It is
bumped by hand. The builder's call: `git describe` would pick up the
repository's `v1-final` tag and does not work in the container, which only
sees `firmware/`.

### `main`

`app_main` logs the version (from `esp_app_get_description()`), then calls
`esp_ota_mark_app_valid_cancel_rollback()`. A comment says it moves to "after
the device has reached the backend" once that exists. Nothing else.

### `core` and its tests

- **Enforcement.** ESP-IDF gives every component a set of common components
  (`freertos`, `log`, `esp_common`, `esp_system`, `soc`, `hal`, …) whatever its
  `REQUIRES` says. So `REQUIRES` alone only blocks drivers and Wi-Fi. Two
  checks together are the enforcement:
  - `core` lists nothing hardware-related in `REQUIRES`;
  - `scripts/test.sh` fails when a file under `components/core/` includes a
    header from ESP-IDF, FreeRTOS, lwIP, mbedTLS or the hardware layers
    (`esp_*`, `freertos/`, `driver/`, `soc/`, `hal/`, `nvs*`, `lwip/`,
    `mbedtls/`, `sdkconfig.h`).
  Strict: not even `esp_log.h` or `esp_err.h`. `core` declares its own result
  and logging interfaces when it first needs them. My call.
- **Tests** follow ESP-IDF's current pattern: each component that has tests
  has a `host_test/` app next to it, an ESP-IDF project built for the `linux`
  target with Unity. Its program's exit code is non-zero when a test fails.
  `scripts/test.sh` runs the include check, then builds and runs every
  `components/*/host_test`. My call, instead of one shared runner, because the
  old shared test-component mechanism (`TEST_COMPONENTS`) may not survive in v6.
- Until `core` has real code, it holds one trivial function and one test of
  it, only to prove the pipeline. The first real core feature replaces both.

### `scripts/idf.sh`

- Runs `idf.py "$@"` in `espressif/idf:<pinned tag>`, with `firmware/` mounted
  as the project (SELinux relabel), as the host user's UID/GID with a writable
  `HOME`, so `build/` is not owned by root.
- When `ESPPORT` (default `/dev/ttyUSB0`) exists, it passes the device through
  with `--group-add` of the port's group, so `flash` and `monitor` work without
  the host user joining `dialout`. SELinux may still block the container's
  access to the tty; the builder finds the narrowest option that works
  (e.g. `--security-opt label=disable` only when a port is passed). It is
  interactive (TTY) when the terminal is.
- It can also run `esptool.py` (for `flash_id`, `chip_id` and the future
  provision script), not only `idf.py`.
- `firmware/README.md` gives the commands: build, flash, monitor, host tests,
  reading chip information.

### Ignores

Add to `.gitignore`: `firmware/sdkconfig`, `firmware/sdkconfig.old`,
`firmware/test/host/sdkconfig*`, `managed_components/`. `build/` is already
ignored. `dependencies.lock` is committed once dependencies exist. Add
`firmware` to `.dockerignore`.

### `CLAUDE.md` "Firmware conventions"

A section like the backend's, short: the layout; the layer rule (`core` is
platform-free and enforced by `REQUIRES`; drivers implement core's
interfaces; `main` wires them); the testing layers; that `partitions.csv`,
`CONFIG_PARTITION_TABLE_OFFSET` and bootloader settings are fixed once boards
exist (changing them means a USB reflash of every board); identity in its own
partition; no eFuses on development boards; `version.txt` bumped by hand;
commands in `firmware/README.md`.

### Verification on the board

- `esptool.py flash_id` / `chip_id`: 16 MB flash; note the chip revision in the README (it
  decides Secure Boot V1 or V2 later).
- `idf.sh flash monitor`: the log shows the custom partition table and the
  version line; reset the board and it boots again.
- Flash a second time: still boots (rollback does not trip on a USB-flashed
  image).
- Host tests pass, and fail when a test is made to fail.
- The include check fails when a core file includes `esp_log.h`.

## Left to the builder

- The exact ESP-IDF tag, from the latest stable release. The suggestion is
  `v6.0.3` (the newest patch of a release series with patches).
- The partition table offset `0x10000` and the exact sizes, within the rules
  above.
- The scripts' exact interface.
- File names inside components.
