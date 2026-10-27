# Firmware connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board joins Wi-Fi from a serial command, connects to the device
listener over mTLS, gets enrolled with `pair`, says `hello`, and stays
connected. A Linux build of the same logic and network code is tested end to
end against the real backend.

**Architecture:**
- **`core`** (platform-free): one `Device` class reacts to events and drives
  interfaces it declares. It also holds the protocol encode/decode over
  cJSON, the console parser and small text helpers.
- **`runtime`** (esp32 and linux): an event queue that runs every `Device`
  call on one task, FreeRTOS timers, and a console line reader.
- **`connection`** (esp32 and linux): `Link` over `esp_websocket_client`, and
  `PairingApi` over `esp_http_client`.
- **`board`** (esp32 only): Wi-Fi, NVS settings, the identity reader.
- **Two apps wire them:** `main/` for the board, `linux/` for the Linux
  build. Vitest's new `firmware` project runs the Linux app against
  `useDeviceServer({ api: true })`.

**Tech Stack:** ESP-IDF v6.0.3 (Docker), C++ (no exceptions/RTTI), Unity,
`espressif/cjson`, `espressif/esp_websocket_client` 1.8.x, Vitest, Bash.

**Spec:** `docs/superpowers/specs/2026-10-27-firmware-connection-design.md`

## Global Constraints

- **`core`** includes no ESP-IDF, FreeRTOS or hardware header, and
  `scripts/test.sh`'s include check passes. `cJSON.h` is allowed.
- **Hardware interfaces are abstract classes**, and test fakes are subclasses.
  No exceptions, no RTTI.
- **The console lines** tests and people rely on are exactly:
  - `not provisioned — run scripts/provision-device.sh`
  - `no backend address — write firmware/backend-url.txt and rebuild`
  - `no Wi-Fi — type: wifi <ssid> <password>`
  - `not enrolled — type: pair`
  - `pairing code: XXXX-XXXX (expires in N min)`
  - `pairing code expired — type: pair`
  - `connected`
- **Timings:**
  - Wi-Fi and link backoff: 1, 2, 4, 8, 16, 30, 30 … s, reset on success;
  - after a 403: every 30 s;
  - after `pair`: every 5 s until the code expires.

  `Device` takes them in a `Timing` struct, so the Linux app can shorten one
  for a test.
- **A refused 403 never stops the retries,** and nothing requests a pairing
  code except `pair`.
- **`readIr` and `sendIr` get exactly one reply:**
  `{"type":"error","code":"INVALID_COMMAND","commandId":…,"message":"IR is not supported yet"}`.
- **Nothing erases or writes `identity` keys.** Private keys exist only on
  the board, or in test temp folders that are deleted.
- **Every project's `dependencies.lock` is committed.**
- **Every commit message ends with** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Done means** these all pass: `firmware/scripts/test.sh`,
  `firmware/scripts/idf.sh build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Review Focus

1. **Two events at once:** a link event and a console line arrive together.
   `Device` must never run concurrently. Every callback posts to the
   `runtime` queue (Task 3 review, plus an e2e test that types while
   connecting).
2. **A server restart while connected** gives a close, then 403s or
   refusals. The board must recover without help (Task 4 e2e: drop, then 403,
   then recover).
3. **A wrong backend URL** (unreachable host, bad TLS) means backoff, never a
   crash or a busy loop (Task 2 unit test: repeated failures follow the
   backoff list).
4. **A long or garbage console line** (over 200 characters, an unknown
   command, missing arguments) gets a usage line and no crash (Task 1 parser
   tests).
5. **A pairing response without a `Date` header, or with an unparseable
   `expiresAt`:** the 15 min fallback, or a clear failure line (Task 1
   tests).

---

### Task 1: Core helpers: protocol, console parser, text

**Files:**
- Create in `firmware/components/core/`:
  - `include/core/protocol.hpp`, `src/protocol.cpp`;
  - `include/core/commands.hpp`, `src/commands.cpp`;
  - `include/core/text.hpp`, `src/text.cpp`;
  - `idf_component.yml` (`espressif/cjson`).
- Delete: `include/core/placeholder.hpp`, `src/placeholder.cpp`,
  `host_test/main/test_placeholder.cpp`.
- Test: `host_test/main/test_protocol.cpp`, `test_commands.cpp`,
  `test_text.cpp`.
- Commit: `components/core/host_test/dependencies.lock`.

**Interfaces (produces), all in `namespace core`:**

```cpp
// protocol.hpp
std::string encode_hello(std::string_view firmware_version);
std::string encode_error(std::string_view code, std::string_view command_id, std::string_view message);
struct ServerMessage {
  enum class Type { ReadIr, SendIr, Error, Unknown } type;
  std::string command_id;   // ReadIr/SendIr
  std::string code, message; // Error
};
std::optional<ServerMessage> decode_server_message(std::string_view text); // nullopt: not JSON / not an object

// commands.hpp
struct WifiCredentials { std::string ssid, password; };
struct Command {
  enum class Kind { Wifi, Pair, Status, Help, Invalid } kind;
  WifiCredentials wifi;   // Kind::Wifi
  std::string error;      // Kind::Invalid: the line to print
};
Command parse_command(std::string_view line);

// text.hpp
struct BackendUrls { std::string websocket, pairing; };
std::optional<BackendUrls> backend_urls(std::string_view base); // "https://h:p" -> wss://h:p/ws, https://h:p/pairing-code
std::string group_pairing_code(std::string_view code);          // "7K4MQ9TX" -> "7K4M-Q9TX"
std::optional<int64_t> parse_iso_utc_ms(std::string_view);       // "2026-10-27T12:15:00.000Z"
std::optional<int64_t> parse_http_date_ms(std::string_view);     // "Tue, 27 Oct 2026 12:00:00 GMT"
int64_t pairing_lifetime_ms(std::optional<std::string_view> date_header, std::string_view expires_at); // fallback 15 min
```

- [ ] **Step 1: Write the failing tests**

  - **`test_protocol.cpp`:**
    - `encode_hello("0.1.0")` is exactly
      `{"type":"hello","firmwareVersion":"0.1.0"}`;
    - `encode_error` gives the fixed `INVALID_COMMAND` frame from Global
      Constraints;
    - decoding:
      - `readIr` and `sendIr` frames, from the contract's examples, give
        their `command_id`;
      - the server's `error` gives its `code` and `message`;
      - `{"type":"x"}` gives `Unknown`;
      - `{nope`, `[]` and `"str"` give `nullopt`;
      - a `readIr` without a `commandId` gives `Unknown`.
  - **`test_commands.cpp`:**
    - `wifi Home secret123` gives `Wifi{Home, secret123}`;
    - `wifi Home` gives an open network;
    - `wifi "My Home" secret123`: a quoted SSID with a space;
    - an SSID of 33 bytes, a password of 7 or 64 characters, and `wifi`
      alone each give `Invalid` with a usage line;
    - `pair`, `status` and `help` give their kinds, also with surrounding
      spaces;
    - an empty line gives `Invalid` with an empty `error` (print nothing);
    - `frobnicate` gives `Invalid` with `unknown command: frobnicate — type help`;
    - a 300-character line gives `Invalid`, with no crash.
  - **`test_text.cpp`:**
    - `backend_urls("https://192.168.1.10:8443")` gives both URLs;
    - a trailing `/` is accepted;
    - `http://…`, an empty string and `garbage` give `nullopt`;
    - the grouping;
    - both date parsers, with a known epoch value;
    - `pairing_lifetime_ms`:
      - a `Date` and an `expiresAt` 15 min apart give 900000;
      - with no `Date` header, or an unparseable one, it gives 900000;
      - an `expiresAt` earlier than `Date` gives 0.

  Run: `firmware/scripts/test.sh`. Expected: FAIL (headers missing).

- [ ] **Step 2: Implement.** cJSON for encode and decode: build with
  `cJSON_CreateObject` and print with `cJSON_PrintUnformatted`, and free
  everything. Hand-written parsers for the dates (no `strptime` or locale).
  For quoted SSIDs, a minimal tokenizer: double quotes, `\"` escapes.

  Update `core/CMakeLists.txt` to the new sources, and add
  `REQUIRES espressif__cjson` (via `idf_component.yml`). Commit
  `host_test/dependencies.lock`.

  Run: `firmware/scripts/test.sh`. Expected: PASS.

- [ ] **Step 3: Commit:** "Add the firmware protocol, console parser and text
  helpers".

### Task 2: Core `Device`

**Files:**
- Create: `firmware/components/core/include/core/device.hpp`,
  `src/device.cpp`, `include/core/ports.hpp`
- Test: `host_test/main/test_device.cpp`, `host_test/main/fakes.hpp`

**Interfaces (produces):**

```cpp
// ports.hpp — what Device drives
struct Console    { virtual ~Console() = default; virtual void print(std::string_view line) = 0; };
struct Wifi       { virtual ~Wifi() = default; virtual void connect(const WifiCredentials&) = 0; };
struct Settings   { virtual ~Settings() = default; virtual std::optional<WifiCredentials> load_wifi() = 0;
                    virtual bool save_wifi(const WifiCredentials&) = 0; };
struct Link       { virtual ~Link() = default; virtual void open() = 0; virtual void send(std::string_view text) = 0;
                    virtual void close() = 0; };
struct PairingApi { virtual ~PairingApi() = default; virtual void request() = 0; };
enum class TimerId { WifiRetry, LinkRetry, PairingExpiry };
struct Timers     { virtual ~Timers() = default; virtual int64_t now_ms() = 0;
                    virtual void schedule(TimerId, uint32_t ms) = 0; virtual void cancel(TimerId) = 0; };

// device.hpp
struct Timing { uint32_t backoff_ms[6] = {1000, 2000, 4000, 8000, 16000, 30000};
                uint32_t not_enrolled_retry_ms = 30000; uint32_t pairing_retry_ms = 5000; };
struct DeviceInfo { std::string firmware_version, mac; bool provisioned; bool backend_configured; };
struct Ports { Console& console; Wifi& wifi; Settings& settings; Link& link; PairingApi& pairing; Timers& timers; };

class Device {
 public:
  Device(DeviceInfo, Ports, Timing = {});
  void start();
  void on_line(std::string_view line);
  void on_wifi_up();   void on_wifi_down();
  void on_link_opened(); void on_link_refused(int http_status); void on_link_failed(); void on_link_closed();
  void on_link_message(std::string_view text);
  void on_pairing_code(std::string_view code, int64_t lifetime_ms); void on_pairing_failed(std::string_view reason);
  void on_timer(TimerId);
};
```

- [ ] **Step 1: Write the failing tests** in `test_device.cpp`.
  `fakes.hpp` has one fake per port that records its calls. The fake clock
  and timers run due timers only on `advance(ms)`. One Unity test per
  behaviour:
  - **Startup stops:**
    - not provisioned prints the `not provisioned` line, and nothing else
      is called;
    - no backend address prints its line and connects nothing.
  - **Wi-Fi:**
    - no saved Wi-Fi prints `no Wi-Fi …`;
    - saved Wi-Fi means `wifi.connect` is called at `start`;
    - `wifi X pw12345678` saves, then connects;
    - an invalid `wifi` prints the usage line, and nothing is saved;
    - `on_wifi_up` makes `link.open` get called;
    - `on_wifi_down` gives retries at 1, 2, 4, 8, 16, 30, 30 s.
  - **Link:**
    - `on_link_opened`: the first `send` is `hello`, then `connected`
      prints, and the backoff resets;
    - `on_link_failed` and `on_link_closed` give backoff retries of
      `open`;
    - `on_link_refused(403)`:
      - prints `not enrolled — type: pair` once, even after three 403s;
      - then retries `open` every 30 s;
      - `pairing.request` is never called by itself.
  - **Pairing:**
    - `pair` after a 403 calls `pairing.request` exactly once;
    - `on_pairing_code("7K4MQ9TX", 900000)` prints
      `pairing code: 7K4M-Q9TX (expires in 15 min)`;
    - then `open` retries every 5 s;
    - at expiry it prints `pairing code expired — type: pair` and goes
      back to 30 s;
    - `pair` while connected prints `already connected` and makes no
      request;
    - `pair` without Wi-Fi says so;
    - `on_pairing_failed` prints the reason.
  - **Server messages:**
    - `readIr` and `sendIr` get exactly the `INVALID_COMMAND` frame;
    - the server's `error` is printed;
    - garbage is printed and ignored;
    - nothing is sent before the link opens.
  - **`status`** prints a line each for the version, MAC, Wi-Fi SSID and
    state, backend state, and the pending code with its remaining minutes.

  Run: `firmware/scripts/test.sh`. Expected: FAIL.

- [ ] **Step 2: Implement `Device`.** It's a small state machine: backend
  state is `Offline | Connecting | Connected | NotEnrolled | Pairing`. It
  uses Task 1's helpers.
  Run: `firmware/scripts/test.sh`. Expected: PASS.

- [ ] **Step 3: Commit:** "Add the firmware's device logic".

### Task 3: Runtime, connection and the Linux app, first e2e

**Files:**
- Create:
  - `firmware/components/runtime/` (CMakeLists, include/src):
    - `EventQueue`: `post(std::function<void()>)`, plus `run()` draining on
      one task (FreeRTOS queue);
    - `FreeRtosTimers : core::Timers`, with callbacks posted to the queue;
    - `ConsoleReader`, a task reading lines with `linenoise` and posting
      `on_line`;
    - `StdoutConsole : core::Console`, which prints and flushes.
  - `firmware/components/connection/`:
    - `WebSocketLink : core::Link`;
    - `HttpPairingApi : core::PairingApi`;
    - both constructed from `TlsMaterial { std::string ca, cert, key; }`
      plus a URL plus an `EventQueue&` plus `Device&`;
    - `idf_component.yml` (`espressif/esp_websocket_client`);
    - automatic reconnect off;
    - the 403 is read from `esp_ws_handshake_status_code`;
    - `Date` is captured in `HTTP_EVENT_ON_HEADER`.
  - `firmware/linux/`:
    - `CMakeLists.txt`: `set(COMPONENTS main)`; `EXTRA_COMPONENT_DIRS ../components`;
      `PROJECT_VER` from `../version.txt`; `-Wno-error=overflow` on the
      websocket component;
    - `sdkconfig.defaults` (`CONFIG_IDF_TARGET="linux"`);
    - `main/main.cpp`:
      - calls `psa_crypto_init()`;
      - defines `esp_timer_get_time` over `CLOCK_MONOTONIC`;
      - reads env `AIRREMOTE_BACKEND_URL`, `AIRREMOTE_CA_FILE`,
        `AIRREMOTE_CERT_FILE`, `AIRREMOTE_KEY_FILE`, `AIRREMOTE_MAC` and the
        optional `AIRREMOTE_NOT_ENROLLED_RETRY_MS`;
      - wires in stand-ins: Wi-Fi is "up" right after `connect`, settings
        are in memory.
  - `firmware/e2e/firmware-build.global-setup.ts`: builds the Linux app once
    with `idf.sh -C linux build`.
  - `firmware/e2e/support/firmware-app.ts`:
    - `startFirmware({ server, client: TestClientName, env? })` writes the
      identity to `firmware/build/e2e-<random>/`, then spawns
      `idf.sh exec linux/build/airremote_linux.elf`;
    - the spawn uses
      `IDF_DOCKER_ARGS="--network host --name airremote-e2e-<random> -e AIRREMOTE_…"`;
    - it returns `{ type(line), waitForLine(text | RegExp, ms), lines, stop() }`;
    - `stop()` runs `docker rm -f` and deletes the folder.
  - Test: `firmware/e2e/connection.e2e.ts`.
- Modify:
  - `firmware/scripts/idf.sh`:
    - `-i` always; `-t` only on a terminal;
    - word-split `IDF_DOCKER_ARGS` appended;
    - when `../certs/device-ca.crt` exists, mount it read-only at
      `/certs/device-ca.crt` (`:ro,z`).
  - `vitest.config.ts`: a project `firmware` with
    - include `firmware/e2e/**/*.e2e.ts`;
    - globalSetup `[postgresSetup, deviceCertsSetup, firmware build setup]`;
    - `hookTimeout` and `testTimeout` of 300 s / 60 s.
  - root `package.json`: `"test:firmware": "vitest run --project firmware"`.
  - `firmware/scripts/test.sh`: also builds `linux/`.

- [ ] **Step 1: Write the first e2e test** (fails, nothing exists):
  `an enrolled device connects and says hello with its version`:
  - `allowDevice('aa:bb:cc:dd:ee:01')`;
  - start the firmware with client `allowed`, and type `wifi test-ssid password123`;
  - wait for `connected`;
  - poll the `devices` row until `firmware_version` equals the content of
    `firmware/version.txt`.

  Run: `pnpm test:firmware`. Expected: FAIL.

- [ ] **Step 2: Implement** the components, the Linux app, the `idf.sh`
  changes and the Vitest wiring above. Commit the Linux app's
  `dependencies.lock`.
  Run: `pnpm test:firmware`, then `firmware/scripts/test.sh`, then
  `pnpm test:e2e` (which must not build the firmware: check it takes the
  usual time). Expected: PASS.

- [ ] **Step 3: Commit:** "Run the firmware on Linux against the device
  listener".

### Task 4: The rest of the e2e flows

**Files:**
- Test: `firmware/e2e/connection.e2e.ts`. Modify the firmware only where a
  test exposes a bug.

- [ ] **Step 1: Write the tests:**
  - **Pairing:** with no `devices` row, the app prints
    `not enrolled — type: pair`. `pair` prints a code. `POST /devices` with
    that code, as the signed-in owner (`createApiClient`'s `signIn` and
    `call`), makes the app print `connected` within 10 s.
  - **A 403 doesn't stop it:** start not enrolled, with
    `AIRREMOTE_NOT_ENROLLED_RETRY_MS=500`. Then `allowDevice` without
    `pair`, and expect `connected` within 5 s.
  - **IR commands:**
    - connect, then create a remote and `learn` through the API;
    - `pollUntilSettled` gives `status: 'failed'`, `error.code: 'DEVICE_ERROR'`;
    - the `device_commands` row's `error_code` is `INVALID_COMMAND`.
  - **Reconnecting:**
    - connected; terminate the socket server-side (via
      `device.server.websocketServer.clients`);
    - expect `connected` a second time, and two hellos (a second
      `firmware_version` write is fine: check the log lines, or count
      opens via `connections.onConnectionClosed`).
  - **Wi-Fi first:** a fresh start prints `no Wi-Fi — type: wifi <ssid> <password>`.
    After `wifi test-ssid password123`, it prints `connected`.
  - **Typing while connecting:** `status` typed right after `wifi …` gets a
    status reply, and `connected` still follows (Review Focus 1).

  Run: `pnpm test:firmware`. Expected: PASS, after fixing anything they
  expose.

- [ ] **Step 2: Commit:** "Test the firmware's pairing, retries and IR
  replies end to end".

### Task 5: `dev-certs.sh --host`

**Files:**
- Modify: `scripts/dev-certs.sh`, `backend/README.md`
- Test: `backend/e2e/dev-certs.e2e.ts`

- [ ] **Step 1: Failing test:**
  - `dev-certs.sh --out <tmp> --host 192.168.1.10 --host airremote.local`
    gives a server certificate whose SAN lists
    `DNS:localhost, IP:127.0.0.1, IP:192.168.1.10, DNS:airremote.local`;
  - it verifies against the CA;
  - the CA's fingerprint is unchanged from the run before;
  - `--host` with no value exits 1.

  Run: `pnpm test:e2e backend/e2e/dev-certs.e2e.ts`. Expected: FAIL.

- [ ] **Step 2: Implement:**
  - repeatable `--host`;
  - IPv4 or IPv6 shape gives `IP:`, otherwise `DNS:`;
  - the server certificate is reissued and the CA kept.

  `backend/README.md` explains when you need it.
  Run: the Step 1 command. Expected: PASS.

- [ ] **Step 3: Commit:** "Let dev-certs.sh name more hosts in the server
  certificate".

### Task 6: The board

**Files:**
- Create: `firmware/components/board/`:
  - `EspWifi : core::Wifi`: station mode; up on `IP_EVENT_STA_GOT_IP`, down
    on disconnect; events posted to the queue;
  - `NvsSettings : core::Settings`: partition `nvs`, namespace `wifi`, keys
    `ssid` and `password`;
  - `read_identity() -> std::optional<TlsMaterial-like {cert, key}>`:
    partition `identity`, opened `NVS_READONLY`, never erased; any error
    gives `nullopt`.
- Modify:
  - `firmware/main/main.cpp`, `firmware/main/CMakeLists.txt`:
    - `nvs_flash_init()`, with the usual erase-on-error recovery for `nvs`
      only;
    - netif and the event loop;
    - the UART console via `uart_vfs_dev_use_driver`, then `ConsoleReader`;
    - MAC from `esp_read_mac(ESP_MAC_WIFI_STA)`;
    - version from `esp_app_get_description()`;
    - the CA embedded from `/certs/device-ca.crt` (`EMBED_TXTFILES`), with a
      CMake `FATAL_ERROR` naming `scripts/dev-certs.sh` when it's missing;
    - the backend URL from `firmware/backend-url.txt`, read in CMake with
      `CMAKE_CONFIGURE_DEPENDS` into a compile definition (empty when
      missing);
    - the image marked valid after `start` (unchanged).
  - `firmware/components/core` stays untouched.
  - `.gitignore`: `firmware/backend-url.txt`.
  - Commit the board app's `dependencies.lock`.
- Docs:
  - `firmware/README.md`:
    - setting up a board, in order: `dev-certs.sh --host <LAN IP>`,
      `pnpm dev`, `backend-url.txt`, build, flash, provision, `wifi`,
      `pair`, enroll;
    - the console commands;
    - the Linux build;
    - `pnpm test:firmware`.
  - `CLAUDE.md`'s firmware conventions:
    - the `core`/`runtime`/`connection`/`board` split;
    - the Linux app;
    - `firmware/e2e`;
    - `pnpm test:firmware`.

- [ ] **Step 1:** Implement, then run `firmware/scripts/idf.sh build`
  (expected: exit 0, image under the 4 MB slot). Then
  `firmware/scripts/test.sh` and `pnpm test`.
- [ ] **Step 2: On the board** (the owner types the real Wi-Fi details):
  - `scripts/dev-certs.sh --host <LAN IP>` and restart `pnpm dev`;
  - write `backend-url.txt`, build, flash, then `monitor`;
  - expected: `no Wi-Fi …`;
  - `wifi …` gives `not enrolled — type: pair`;
  - `pair` gives a code;
  - enroll through the API: `connected`, and `devices.firmware_version` is
    `0.1.0`;
  - after a reset it reconnects by itself;
  - after stopping and starting `pnpm dev`, it reconnects.
- [ ] **Step 3: Commit:** "Connect the board to Wi-Fi and the backend".
