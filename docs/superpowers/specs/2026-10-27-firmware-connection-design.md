# Firmware: Wi-Fi and the backend connection — design

Date: 2026-10-27 · Branch: a new branch off `main`

## Intent

The board can now be flashed and provisioned, but it does nothing yet. This
change makes it a device:

- it joins Wi-Fi;
- it connects to the backend's device listener over mTLS with the identity
  `scripts/provision-device.sh` gave it;
- it gets itself enrolled;
- it stays connected and says `hello` with its firmware version.

Everything a person does with it goes through the serial console for now.

It also builds the second test layer agreed in the firmware foundations design
(`docs/superpowers/specs/2026-10-27-firmware-scaffold-design.md`). The
firmware's core and its connection code are built as a Linux program and
tested end to end against the real backend.

## Decided by the owner

- **Wi-Fi details come from the serial console**, not a captive portal: V1's
  portal is not repeated. A portal or Bluetooth setup comes later, for boards
  that go to other people.
- **The pairing code is obtained on request.** A console command asks the
  backend for one and prints it. The board never requests codes by itself.
- **After `pair`, the board retries the WebSocket with backoff**, so it
  connects by itself once the owner has enrolled it. Those retries are
  connection attempts, not pairing-code requests. (Proposed and accepted.)
- **The Linux test layer is built now:**
  - a Linux build of the firmware, with the same `core` and the same
    connection code;
  - Wi-Fi replaced by a stand-in;
  - the console on stdin and stdout.

  Vitest e2e tests drive it against the real device listener.
- **The firmware e2e tests are their own `pnpm test:firmware`.** `pnpm test`
  still runs them, and `pnpm test:e2e` stays backend-only.
- From the proposal the owner accepted:
  - **No identity:** the board prints how to provision it and goes no further.
  - **IR commands:** until IR exists, `readIr` and `sendIr` are answered with
    an `error` of code `INVALID_COMMAND`, so every command gets its one reply.
  - **The backend address is set at build time**, as decided earlier.

## What the spike established

A throwaway ESP-IDF v6.0.3 app on the `linux` target, using
`espressif/esp_websocket_client` (1.8.0) and `espressif/cjson` from the
component registry, ran against a local mTLS WebSocket server. It:

- connected with a client certificate (the server saw CN = MAC and
  `airremote.v1`);
- sent `hello`, and received a server frame;
- made an mTLS `POST /pairing-code` with ESP-IDF's `esp_http_client` (201
  with the body);
- received a 403 upgrade refusal as `esp_ws_handshake_status_code == 403` on
  the error event.

The Linux build needed four things, and the design keeps them:

1. **Only the app's own components:** `set(COMPONENTS main)` in the project,
   as the host tests already do. Without it, ESP-IDF pulls in hardware
   components the Linux target doesn't have.
2. **One warning allowed:** `-Wno-error=overflow` on the
   `espressif__esp_websocket_client` component only. It stores
   `portMAX_DELAY` in an `int`, which still means "wait forever" when passed
   back.
3. **A clock:** `esp_timer_get_time()` implemented over
   `clock_gettime(CLOCK_MONOTONIC)`, because `esp_timer` has no Linux
   implementation.
4. **PSA crypto:** `psa_crypto_init()` called at start. ESP-IDF v6's
   mbedTLS 4 can't parse EC keys without it, and on the chip the startup
   code does it, but on Linux nothing does.

## Goals

- **Wi-Fi from the console:** `wifi <ssid> [password]` saves the details in
  NVS namespace `wifi` and connects. A lost connection is retried with
  backoff, and the board reconnects after a reboot without being told again.
- **A connection that survives:** a provisioned, enrolled board connects to
  the device listener at boot and sends `hello`. It reconnects with backoff
  after any drop.
- **Enrollment by request:**
  - a board that isn't enrolled says so and how to fix it;
  - `pair` prints a pairing code;
  - after `pair`, the board connects by itself once enrolled.
- **Every server command is answered:** `readIr` and `sendIr` get exactly one
  reply each, `error` with `INVALID_COMMAND`.
- **`status`** prints what the board knows: firmware version, MAC,
  identity, Wi-Fi, backend state, and a pending pairing code.
- **The Linux build** runs that same logic and connection code, and e2e
  tests cover the flows above against the real backend.
- **A working setup for a real board:** `dev-certs.sh` can put your machine's
  LAN address in the server certificate. The firmware build embeds the CA and
  takes the backend address from a local, git-ignored config file.
- **Checked on the real board** against `pnpm dev`.

## Non-goals

- IR, the button, the LEDs. The "not provisioned" LED pattern comes with the
  LED feature.
- A captive portal, Bluetooth setup, or entering the backend address at run
  time.
- OTA, SNTP / certificate expiry checks, revocation.
- Factory reset (wiping `nvs`).
- Changes to the backend or the device protocol. The one exception is
  `dev-certs.sh --host`, a dev-tool change.

## Anti-goals

- **Automatic pairing-code requests.**
- **A private key anywhere but the board.** The Linux build reads its test
  identity from files the tests create and delete.
- **Logic in drivers that tests can't reach.** Deciding what to do next lives
  in `core`, and drivers only carry out what it asks.
- **Wi-Fi credentials in build files** (`sdkconfig`, images, the repo).
- **Two copies of the connection code**, one for the board and one for
  Linux.

## Constraints

- `CLAUDE.md`'s firmware conventions apply:
  - `core` is platform-free, enforced by its include check;
  - C++ without exceptions or RTTI;
  - hardware interfaces are abstract classes, with fakes as subclasses;
  - everything builds through `firmware/scripts/idf.sh`;
  - the partition table and bootloader settings stay as they are.
- The device protocol is exactly `@airremote/contracts`' `device-protocol`:
  subprotocol `airremote.v1`, `hello`, `error`, `readIr`/`sendIr`, and the
  server's `error`. `POST /pairing-code` answers
  `{ pairingCode, expiresAt }` with 201. A refused upgrade is 403 when the
  device isn't enrolled.
- The registry components are pinned in each component's `idf_component.yml`
  (e.g. `components/connection/`, `components/core/`). Every project's
  `dependencies.lock` is committed: the board app, the Linux app and each
  `host_test`. `managed_components/` is already git-ignored.

## The design

### Layout

```
firmware/
  main/                 the board's app_main: wires esp32 drivers to core
  components/
    core/               platform-free: the device logic, protocol, console commands
    connection/         WebSocket + pairing over esp_websocket_client / esp_http_client;
                        builds for esp32 and linux, implements core's link interfaces
    board/              esp32-only drivers: Wi-Fi (esp_wifi), NVS settings, identity reader
  linux/                an ESP-IDF app for the linux target: wires core + connection
                        to Linux stand-ins (Wi-Fi, settings, identity from files)
  e2e/                  Vitest e2e tests that run the linux app against the device listener
```

Component and folder names are the builder's call, within this split: what
decides lives in `core`, the shared network code in one component, the
board-only code in another, and two apps that wire them.

### `core`: the device

A single `Device` class owns the state, and nothing else decides anything.
It reacts to events and talks to the outside only through interfaces it
declares (abstract classes):

- **`Console`:** print a line.
- **`Wifi`:** `connect(ssid, password)`, `disconnect()`; it reports up or
  down.
- **`Settings`:** load and save the Wi-Fi details.
- **`Link`:** `open()`, `send(text)`, `close()`; it reports opened,
  refused(status), closed, and message(text).
- **`PairingApi`:** `request()`, which reports a code with its expiry or a
  failure.
- **`Timers`:** schedule and cancel a callback after N ms, and read the
  current time.

Events come in from these interfaces and from console commands. What `Device`
does with them:

| Situation | The board does |
| --- | --- |
| Boot without an identity | prints `not provisioned — run scripts/provision-device.sh`; nothing else runs |
| No Wi-Fi details | prints `no Wi-Fi — type: wifi <ssid> <password>` |
| `wifi <ssid> [password]` | validates (SSID 1–32 bytes; password empty or 8–63), saves, (re)connects |
| Wi-Fi down | retries with backoff 1, 2, 4 … 30 s; prints it |
| Wi-Fi up | opens the link |
| Link refused with 403 | prints `not enrolled — type: pair` (once per run of 403s); retries the link quietly every 30 s, never requesting a code. The backend also answers 403 when it can't check the device (e.g. its database is down), so an enrolled board must not give up on a 403 (my call) |
| `pair` while not enrolled | requests one code; prints it grouped (`7K4M-Q9TX`) with `expires in N min`; then retries the link every 5 s until it opens or the code expires |
| The code expires before enrollment | prints `pairing code expired — type: pair`; back to the 30 s retries |
| `pair` at any other time | says why not (already connected, no Wi-Fi, …) |
| Link fails for any other reason (network, TLS, 5xx) | retries with backoff 1, 2, 4 … 30 s |
| Link opened | sends `hello` with the firmware version; resets the backoff; prints `connected` |
| Link closed | retries with backoff |
| `readIr` or `sendIr` arrives | replies `{ type: 'error', code: 'INVALID_COMMAND', commandId, message: 'IR is not supported yet' }` |
| The server's `error` arrives | prints it |
| A frame that is not valid JSON or not a known message | prints and ignores it |
| `status` | prints the version, MAC, identity yes/no, Wi-Fi (SSID, up/down), backend state, pending code |

The 5 s retry after `pair` and the backoff numbers match the simulator. The
version and MAC are given to `Device` when it's built. On the board they
come from `esp_app_get_description()` and the base MAC. On Linux they come
from `version.txt` (at build time) and the test identity.

**Protocol encoding.** Encoding and decoding are core's own code over
`espressif/cjson`. cJSON is plain C with no ESP-IDF headers, so it is allowed
in `core`. The include check stays as it is. Encoding goes through one
function per message type, so nothing else builds JSON by hand.

**The console.** Commands are parsed in `core`, from the line, into typed
commands, and those parsers are unit-tested. ESP-IDF's `console` component
only reads lines and hands them over, on UART for the board and on stdin for
Linux. That's my call: argtable's parsing would put command logic where tests
can't reach it.

### `connection`: the shared network code

- **`Link`** over `esp_websocket_client`:
  - URL `wss://<backend>/ws`, subprotocol `airremote.v1`;
  - the server CA plus the device's certificate and key from the identity;
  - automatic reconnect off, because `core` owns retries;
  - a 403 is read from the error event's `esp_ws_handshake_status_code`;
  - pings and pongs are left to the client.
- **`PairingApi`** over `esp_http_client`: `POST https://<backend>/pairing-code`
  with the same TLS material. It parses the JSON body.
  - **Expiry:** the board has no calendar clock (no SNTP), so it reports the
    code's lifetime in ms. That is `expiresAt` minus the response's HTTP
    `Date` header, which Node sets on every response, so both times come from
    the server's clock. Without a usable `Date`, it falls back to 15 min (the
    backend's TTL). `core` turns the lifetime into a deadline on its own
    clock. My call.
- **Events cross from client tasks to the `Device`** through one queue that a
  single task drains. `Device` is never called from two tasks at once. The
  builder picks the mechanism; it must work on both targets.
- **The spike's four Linux fixes** live here or in the Linux app, wherever
  they belong.

### `board`: the ESP32 drivers

- **Wi-Fi:** station mode with `esp_netif` and `esp_wifi`. It reports up when
  it has an IP address, and down otherwise.
- **Settings:** `nvs_flash` partition `nvs`, namespace `wifi`, keys `ssid`
  and `password`.
- **Identity:** `nvs_flash_init_partition("identity")`, then
  `nvs_open_from_partition(…, NVS_READONLY)`. It reads `identity/cert` and
  `identity/key` as strings. A missing entry means "not provisioned".
  - **It must never erase `identity`:** not even on `ESP_ERR_NVS_NO_FREE_PAGES`
    or `NEW_VERSION_FOUND`, the usual recovery for `nvs`. It reports "not
    provisioned" instead.
  - **It never sets keys.** NVS may still write its own page headers on a
    blank partition. That's harmless: the provision script parses it as no
    identity.

### The backend address and the server CA

- **Backend address:** one line in `firmware/backend-url.txt`, git-ignored,
  e.g. `https://192.168.1.10:8443`.
  - CMake reads it on every configure (`CMAKE_CONFIGURE_DEPENDS`) into a
    compile definition, so an edit takes effect on the next build.
  - Not Kconfig, which is my call: a value already in the generated
    `sdkconfig` would ignore later edits to a defaults file.
  - Without the file, the board prints
    `no backend address — write firmware/backend-url.txt and rebuild` instead
    of connecting.
- **Server CA:** embedded in the image at build time from the repo's
  `certs/device-ca.crt`.
  - `idf.sh` mounts **only that one file**, read-only, into the container,
    when it exists. Private keys under `certs/` are never visible to the
    build.
  - The build fails with a clear message if the file is missing.
- **On Linux,** the address, the CA and the identity come from command-line
  arguments or environment variables. The tests set them.

### `dev-certs.sh --host`

`scripts/dev-certs.sh [--host NAME_OR_IP]…` adds each value to the server
certificate's subjectAltName, as a DNS or IP entry by its shape, next to
`localhost` and `127.0.0.1`. It reissues the server certificate and keeps the
CA as it does today. `backend/README.md` explains when you need it: a real
board connecting to your machine. `backend/e2e/dev-certs.e2e.ts` gets a case
showing a `--host 192.168.1.10` certificate carries that IP.

### The Linux app

- An ESP-IDF project for the `linux` target. It builds `core` and
  `connection`, plus stand-ins:
  - **Wi-Fi:** "up" as soon as details are set;
  - **Settings:** kept in memory;
  - **Identity:** read from the files it's given.
- The console runs on stdin and stdout. Lines the tests wait for are printed
  exactly as in the table above.
- Built by `firmware/scripts/idf.sh -C linux build`. Run by
  `idf.sh exec linux/build/<name>.elf` with host networking, so it reaches a
  device listener on `127.0.0.1`, and with stdin attached (`-i`), since tests
  pipe commands into it. `idf.sh` gets a way to request both; the builder
  picks how.
- The project sets `PROJECT_VER` from `../version.txt`, because ESP-IDF only
  reads `version.txt` from the project's own folder.

### Tests

- **Unit (`core/host_test`):**
  - the console parsers;
  - the protocol encode and decode for every message;
  - `Device` driven through fakes of every interface, covering each row of
    the table above, including:
    - backoff sequences, with a fake clock;
    - that `pair` sends exactly one request;
    - that the 5 s retries fall back to 30 s on expiry;
    - that a 403 never stops the retries;
    - that `hello` is sent first on every open.
  - The `Date` header's lifetime arithmetic, and its 15 min fallback.

  The old placeholder goes.
- **Firmware e2e (`firmware/e2e/*.e2e.ts`, in a new root Vitest project
  `firmware`):**
  - `pnpm test:firmware` runs only this project. `pnpm test` runs it along
    with the others, so a full run still covers the firmware. `pnpm test:e2e`
    stays backend-only and doesn't build the firmware (decided by the owner).
  - If pnpm's strict layout keeps a test under `firmware/` from importing
    `ws` or `@airremote/db`, `firmware/e2e` gets its own small
    `package.json` in the workspace. That's the builder's call.
  - **Setup:** a global setup builds the Linux app once per run. Each test
    starts the device listener with `useDeviceServer({ api: true })`, writes
    a client identity from the run's test certificates into a temp folder
    under `firmware/build/` (deleted after), and starts the app with that
    identity.
  - **Cases:**
    - an enrolled device connects, and the database gets its `hello`
      version;
    - an unenrolled device prints `not enrolled — type: pair`;
    - `pair` prints a code;
    - enrolling with that code through the API makes the app print
      `connected` within the retry window;
    - a `readIr` sent through the API (as `learn-buttons.e2e.ts` does) is
      answered. The API shows the command failed with `DEVICE_ERROR`, and
      `device_commands.error_code` is `INVALID_COMMAND`;
    - after a 403, it keeps retrying. An enrolled board whose backend briefly
      refuses it reconnects by itself;
    - after the device server drops the connection, the app reconnects and
      says `hello` again;
    - without Wi-Fi details, it prompts, and after `wifi test-ssid
      password123` it connects.
- **On the board, once:**
  - `dev-certs.sh --host <LAN IP>`, `pnpm dev`, then `sdkconfig.local`, then
    build and flash;
  - `wifi …`, then `pair`, then enroll with the code;
  - `connected` appears, and `devices.firmware_version` is `0.1.0`;
  - after a reset, it reconnects without being told anything;
  - while you stop and restart `pnpm dev`, it reconnects;
  - `status` shows all of it.

### Docs

- `firmware/README.md`: setting up a board (the order above), the console
  commands, `sdkconfig.local`, and the Linux build and its tests.
- `backend/README.md`: `--host`.
- `CLAUDE.md`'s firmware conventions:
  - the three-way split (`core`, `connection`, `board`);
  - the Linux app;
  - where e2e tests go.

## Left to the builder

- Names of components, classes and files within the split above.
- The cross-task event mechanism, as long as `Device` is only ever called
  from one task.
- How `idf.sh` takes host networking and the CA mount.
- Output wording beyond the lines quoted in the table. Those are what the
  tests match.
- How the work splits into plans and tasks. The suggested order: core and
  the Linux app's console first, then connection and the e2e tests, then the
  board drivers and the check on the board.
