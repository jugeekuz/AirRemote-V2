# Firmware scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `firmware/` ESP-IDF project for the FireBeetle ESP32 with its final
partition table and bootloader settings, a platform-free C++ `core` component
with host tests, and the firmware decisions written into the repository.

**Architecture:** ESP-IDF v6.0.3 runs only inside Docker, behind
`firmware/scripts/idf.sh`. `main` holds `app_main`, and `components/core` is
platform-free C++. Its Unity tests are a `host_test/` ESP-IDF app built for the
`linux` target. `firmware/scripts/test.sh` checks core's includes, then builds
and runs every `components/*/host_test`.

**Tech Stack:** ESP-IDF v6.0.3 (`espressif/idf:v6.0.3`), C++ (exceptions and
RTTI off), Unity, Bash, Docker.

**Spec:** `docs/superpowers/specs/2026-10-27-firmware-scaffold-design.md`

## Global Constraints

- Never edit, import, symlink or build from `legacy/`. Don't copy V1's
  `default_16MB.csv` or its structure.
- No ESP-IDF, CMake or cross-compiler on the host. Every build, test and flash
  goes through `espressif/idf:v6.0.3` via `firmware/scripts/idf.sh`.
- Docker mounts use `:Z` (Fedora SELinux). The container runs as the host's
  UID:GID with `HOME=/tmp`, so no root-owned files appear in `firmware/`.
- C++ for `main` and every component; `CONFIG_COMPILER_CXX_EXCEPTIONS` and
  `CONFIG_COMPILER_CXX_RTTI` stay off (ESP-IDF's defaults).
- No eFuse writes: never run `espefuse.py` with burn commands, and don't enable
  secure boot or flash encryption.
- No Wi-Fi, WebSocket, IR, button or LED code; no provision script; no CI; no
  pnpm integration.
- The firmware version comes from `firmware/version.txt` (`0.1.0`).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`build/` and `sdkconfig` files written by the container are owned by the
   host user.** A root-owned `build/` would break the next `rm -rf` or IDE
   indexing. Task 1 Step 6 checks the owner.
2. **`test.sh` exits non-zero when any host test fails, or when the include
   check fails.** A green script over a red test is the worst failure here.
   Task 2 Steps 2 and 7 make it fail on purpose.
3. **The include check catches includes with spaces and angle brackets**
   (`#  include <esp_log.h>`, `#include "freertos/FreeRTOS.h"`). Task 2 Step 7
   tests both forms.
4. **`idf.sh` without a board plugged in still builds.** It must only pass
   `--device` when the port exists. Task 1 runs before the board is
   connected.
5. **Reflashing does not wipe `identity`, and the board boots again after a
   reset and after a second flash.** Task 3 Steps 4–5.

---

### Task 1: Device project, Docker wrapper, final partition table

**Files:**
- Create: `firmware/CMakeLists.txt`, `firmware/version.txt`,
  `firmware/partitions.csv`, `firmware/sdkconfig.defaults`,
  `firmware/main/CMakeLists.txt`, `firmware/main/main.cpp`,
  `firmware/scripts/idf.sh`
- Modify: `.gitignore`, `.dockerignore`

**Interfaces:**
- Produces: `firmware/scripts/idf.sh <idf.py args…>` runs `idf.py` in
  `/project` (= `firmware/`). `firmware/scripts/idf.sh exec <cmd…>` runs any
  command there (e.g. `exec esptool.py chip_id`, or a host test ELF). The image
  tag lives in one variable, `IDF_IMAGE=espressif/idf:v6.0.3`.

- [ ] **Step 1: Write `firmware/scripts/idf.sh`** (executable, `set -euo pipefail`)

  - `docker run --rm -v "$firmware_dir:/project:Z" -w /project -u "$(id -u):$(id -g)" -e HOME=/tmp`
  - `-it` only when stdin and stdout are terminals.
  - Port: `ESPPORT` (default `/dev/ttyUSB0`). Only when it exists, add
    `--device "$port" --group-add "$(stat -c %g "$port")"` and pass
    `-e ESPPORT -e ESPTOOL_PORT="$port"` through.
  - The first argument `exec` runs the rest as a command. Otherwise it runs
    `idf.py "$@"`.
  - The image's entrypoint already exports the IDF environment, so the
    command runs directly.

- [ ] **Step 2: Write the project files**

  - `firmware/CMakeLists.txt`: `cmake_minimum_required(VERSION 3.22)`,
    `include($ENV{IDF_PATH}/tools/cmake/project.cmake)`, `project(airremote)`.
  - `firmware/version.txt`: `0.1.0`
  - `firmware/partitions.csv`: exactly this, with a header comment saying
    the table is fixed once boards exist:

    ```
    # Name,   Type, SubType,  Offset,   Size
    nvs,      data, nvs,      0x11000,  0x6000
    otadata,  data, ota,      0x17000,  0x2000
    identity, data, nvs,      0x19000,  0x3000
    nvs_keys, data, nvs_keys, 0x1C000,  0x1000
    app0,     app,  ota_0,    0x20000,  0x400000
    app1,     app,  ota_1,    0x420000, 0x400000
    coredump, data, coredump, 0x820000, 0x20000
    ```
  - `firmware/sdkconfig.defaults`:

    ```
    CONFIG_IDF_TARGET="esp32"
    CONFIG_ESPTOOLPY_FLASHSIZE_16MB=y
    CONFIG_PARTITION_TABLE_CUSTOM=y
    CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"
    CONFIG_PARTITION_TABLE_OFFSET=0x10000
    CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y
    CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH=y
    CONFIG_ESP_COREDUMP_DATA_FORMAT_ELF=y
    ```
    Each group gets a one-line comment on why (the offset leaves room for a
    secure-boot bootloader; rollback is a bootloader setting, so it is set
    before the first flash).

- [ ] **Step 3: Write `main`**

  - `main/CMakeLists.txt`: `idf_component_register(SRCS "main.cpp" REQUIRES app_update esp_app_format log)`.
  - `main/main.cpp`: `extern "C" void app_main(void)` logs
    `"AirRemote firmware %s"` with `esp_app_get_description()->version`
    (tag `"airremote"`), then
    `ESP_ERROR_CHECK(esp_ota_mark_app_valid_cancel_rollback())`, with a
    comment: move this to after the device has reached the backend once it
    can.

- [ ] **Step 4: Update ignores**

  - `.gitignore`, under a `# Firmware (ESP-IDF)` heading:
    `firmware/**/sdkconfig`, `firmware/**/sdkconfig.old`,
    `managed_components/` (`build/` is already there).
  - `.dockerignore`: add `firmware`.

- [ ] **Step 5: Build**

  Run: `firmware/scripts/idf.sh build`
  Expected: exits 0; `firmware/build/airremote.bin` exists.

- [ ] **Step 6: Check the result**

  - `firmware/scripts/idf.sh exec python $IDF_PATH/components/partition_table/gen_esp32part.py build/partition_table/partition-table.bin`
    prints the seven partitions above. Inside `exec`, `$IDF_PATH` must be
    expanded by the container: wrap it in `bash -c '…'`.
  - `grep -E 'CONFIG_PARTITION_TABLE_OFFSET=0x10000|CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y|CONFIG_ESPTOOLPY_FLASHSIZE="16MB"' firmware/sdkconfig`
    matches all three.
  - `strings firmware/build/airremote.bin | grep -x 0.1.0` prints `0.1.0`.
  - `stat -c %U firmware/build firmware/sdkconfig` prints your user, not
    `root`.
  - `git status --short` shows no `build/` or `sdkconfig` files.

- [ ] **Step 7: Commit**

  ```bash
  git add firmware .gitignore .dockerignore
  git commit -m "Scaffold the ESP-IDF firmware with its final partition table"
  ```

### Task 2: Platform-free `core` with host tests and the include check

**Files:**
- Create: `firmware/components/core/CMakeLists.txt`,
  `firmware/components/core/include/core/placeholder.hpp`,
  `firmware/components/core/src/placeholder.cpp`,
  `firmware/components/core/host_test/CMakeLists.txt`,
  `firmware/components/core/host_test/sdkconfig.defaults`,
  `firmware/components/core/host_test/main/CMakeLists.txt`,
  `firmware/components/core/host_test/main/test_main.cpp`,
  `firmware/components/core/host_test/main/test_placeholder.cpp`,
  `firmware/scripts/test.sh`

**Interfaces:**
- Consumes: `firmware/scripts/idf.sh` (Task 1).
- Produces: `namespace core { int placeholder_sum(int a, int b); }` in
  `core/placeholder.hpp`. It exists only to prove the pipeline, and the first
  real core feature deletes it. `firmware/scripts/test.sh` exits 0 only when
  the include check and every host test pass. Each host test app is
  `project(<component>_host_test)`, so its program is
  `build/<component>_host_test.elf`.

- [ ] **Step 1: Write the host test app and the failing test**

  - `host_test/CMakeLists.txt`: `cmake_minimum_required(VERSION 3.22)`,
    `set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../..")`,
    `set(COMPONENTS main)`, then the IDF include and `project(core_host_test)`.
  - `host_test/sdkconfig.defaults`: `CONFIG_IDF_TARGET="linux"`.
  - `host_test/main/CMakeLists.txt`:
    `idf_component_register(SRCS "test_main.cpp" "test_placeholder.cpp" REQUIRES core unity WHOLE_ARCHIVE)`.
  - `test_main.cpp`: `extern "C" void app_main(void)` runs `UNITY_BEGIN()`,
    `unity_run_all_tests()`, then `exit(UNITY_END() == 0 ? 0 : 1)`.
  - `test_placeholder.cpp`:

    ```cpp
    TEST_CASE("placeholder_sum adds two numbers", "[core]") {
        TEST_ASSERT_EQUAL(5, core::placeholder_sum(2, 3));
    }
    ```
  - Create the `core` component with `CMakeLists.txt` and the header, but
    leave `src/placeholder.cpp` out of `SRCS` for now.

- [ ] **Step 2: Write `firmware/scripts/test.sh` and see it fail**

  - Include check first: search `components/core` (excluding
    `host_test/`) for lines matching
    `^\s*#\s*include\s*[<"](esp_|freertos/|driver/|soc/|hal/|nvs|lwip/|mbedtls/|sdkconfig\.h)`.
    Print every hit as `file:line` and exit 1 if any. A comment above the
    pattern explains that ESP-IDF's common components are visible whatever
    `REQUIRES` says, and that this check is the rule's enforcement.
  - Then for each `components/*/host_test`:
    `idf.sh -C components/<name>/host_test build`, then
    `idf.sh exec components/<name>/host_test/build/<name>_host_test.elf`.
    Stop at the first non-zero exit and return it.

  Run: `firmware/scripts/test.sh`
  Expected: FAIL, a link error for `core::placeholder_sum`.

- [ ] **Step 3: Implement `int core::placeholder_sum(int a, int b)` in `src/placeholder.cpp`**

  Add it to `SRCS`. The component's `idf_component_register` has
  `INCLUDE_DIRS "include"` and no `REQUIRES`, with a comment pointing to
  `test.sh`'s include check.

- [ ] **Step 4: Run the tests**

  Run: `firmware/scripts/test.sh`
  Expected: exits 0; output contains `1 Tests 0 Failures 0 Ignored`.

- [ ] **Step 5: Make a test fail on purpose**

  Change the expected `5` to `6`, run `firmware/scripts/test.sh; echo $?`.
  Expected: `1 Failures` and a final `1`. Revert.

- [ ] **Step 6: Link `core` from `main`**

  Add `core` to `main`'s `REQUIRES` (no call yet) and run
  `firmware/scripts/idf.sh build`. Expected: exits 0, so the component builds
  for the `esp32` target too.

- [ ] **Step 7: Prove the include check**

  Add `#include "esp_log.h"` to `src/placeholder.cpp` → `test.sh` prints that
  line's `file:line` and exits 1 before building. Replace it with
  `#  include <freertos/FreeRTOS.h>` → same. Revert both. Then add the same
  include to `host_test/main/test_main.cpp` → still passes (the tests may use
  IDF). Revert.

- [ ] **Step 8: Commit**

  ```bash
  git add firmware
  git commit -m "Add the platform-free core component and its host tests"
  ```

### Task 3: Documentation and checking on the board

**Files:**
- Create: `firmware/README.md`
- Modify: `CLAUDE.md` (a new `## Firmware conventions` section after
  `## Testing`); `firmware/scripts/idf.sh` only if Step 2 needs an SELinux
  option

**Interfaces:**
- Consumes: `idf.sh` and `test.sh` (Tasks 1–2).

- [ ] **Step 1: Plug in the board (owner)**

  Ask the owner to connect it, then `ls -l /dev/ttyUSB* /dev/ttyACM*`. If it
  isn't `/dev/ttyUSB0`, use `ESPPORT=<port>` in every command below.

- [ ] **Step 2: Read the chip**

  Run: `firmware/scripts/idf.sh exec esptool.py chip_id` and
  `firmware/scripts/idf.sh exec esptool.py flash_id`.
  Expected: an ESP32 with its revision (e.g. `v3.0`), and `16MB` flash.
  If the port is denied inside the container while `--group-add` is set,
  it's SELinux: add `--security-opt label=disable` to `idf.sh`, **only when
  a port is passed**, with a comment saying why. Record the chip revision
  and flash size for the README.

- [ ] **Step 3: Flash and watch it boot**

  Run: `firmware/scripts/idf.sh flash monitor` (exit with `Ctrl+]`).
  Expected in the log: the partition table with `identity`, `nvs_keys` and
  `app0` at `0x20000`; `AirRemote firmware 0.1.0`; no panic or reboot loop.
  Press the board's reset button: it boots to the same line.

- [ ] **Step 4: Check `identity` survives**

  `firmware/scripts/idf.sh exec esptool.py write_flash 0x19000 <a 0x3000-byte file of 0xAA>`
  (create it in `build/`), flash the app again with `idf.sh flash`, then
  `idf.sh exec esptool.py read_flash 0x19000 0x3000 build/identity.read` and
  compare: identical. Then erase that region again with
  `esptool.py erase_region 0x19000 0x3000` so the board stays clean.

- [ ] **Step 5: Reflash and boot again**

  Run `idf.sh flash monitor` once more. Expected: the version line again. A
  USB-flashed image is never rolled back.

- [ ] **Step 6: Write `firmware/README.md`**

  Short, in the style of `backend/README.md`:
  - what the firmware is;
  - requirements: Docker only, plus `ESPPORT`;
  - the commands: build, flash, monitor, host tests, chip info, the
    erase-flash warning (it wipes `identity`);
  - the layout;
  - the board facts: chip revision and flash size from Step 2.

- [ ] **Step 7: Write `## Firmware conventions` in `CLAUDE.md`**

  The bullets, as the spec lists them:
  - the layout;
  - `core` is platform-free, enforced by its `REQUIRES` plus `test.sh`'s
    include check, and declares the interfaces drivers implement; `main`
    wires them;
  - C++ with no exceptions or RTTI; abstract classes for hardware
    interfaces, fakes as subclasses;
  - the testing layers (host now; integration against the backend, Wokwi
    and the hardware checklist later);
  - `partitions.csv`, `CONFIG_PARTITION_TABLE_OFFSET` and bootloader
    settings are fixed once boards exist;
  - `identity` is a separate partition that only the provision script
    writes;
  - no eFuses on development boards;
  - `version.txt` is bumped by hand;
  - everything runs through `scripts/idf.sh`;
  - commands are in `firmware/README.md`.

  Also update the opening paragraph's note on the current state if it no
  longer matches (the backend exists; the firmware has started).

- [ ] **Step 8: Run everything once more**

  Run: `firmware/scripts/test.sh && firmware/scripts/idf.sh build && pnpm lint`
  Expected: all exit 0. `pnpm lint` confirms nothing in `firmware/` reaches
  the TypeScript tooling.

- [ ] **Step 9: Commit**

  ```bash
  git add firmware/README.md CLAUDE.md firmware/scripts/idf.sh
  git commit -m "Document the firmware and its conventions"
  ```
