# Dev certificates and the device simulator — design

Date: 2026-10-26 · Branch: a new branch off `main`

## Intent

The device listener needs certificates, and there is no device yet. This
change adds two development tools, built in this order:

1. **`scripts/dev-certs.sh`** — creates the device CA and the server
   certificate the device listener needs, and plays the factory: it issues a
   device certificate for a given MAC address.
2. **The device simulator** — an interactive, good-looking CLI that presents
   itself as an AirRemote mock device and does exactly what a real device
   does against the dev server, so the owner can try flows (enrolling first)
   by hand while the frontend and firmware do not exist yet.

The simulator is a stand-in for the real device, not a test harness for the
whole system: anything a person does (signing in, `POST /devices`) stays with
the person.

## Goals

- One command creates everything the device listener needs, in the places
  `pnpm dev` and Docker Compose already read.
- One command issues a device certificate for a MAC address.
- A simulator you start in a terminal, then drive with `/` commands; `/help`
  lists them.
- `/enroll` runs the device's half of enrollment and waits, as a device
  would, until the owner has enrolled it.
- Every HTTP request and response on the device listener, and every
  WebSocket frame in both directions, is logged.
- Custom messages can be sent, valid or not, to test the server's handling.

## Non-goals

- The simulator never signs in, never calls the API (`POST /devices` etc.),
  and never acts as the user.
- No IR, Wi-Fi provisioning or hardware behaviour.
- No emulation of the real firmware; no firmware changes.
- No certificates for real boards on a LAN (extra hostnames/IPs on the
  server certificate). Later, when a board exists.
- No production certificate tooling (rotation, revocation, real CA).
- No changes to how the backend runs. (Build plumbing is fine: if adding
  `tools/*` to the workspace breaks `backend/Dockerfile`'s
  `pnpm install --frozen-lockfile`, add the missing `COPY` line.)

## Anti-goals

- The simulator doing something a real device could not (e.g. enrolling
  itself), which would make flows look like they work when they don't.
- Silently replacing an existing CA, which would invalidate every device
  certificate already issued.
- Private keys committed to git.
- A full-screen terminal app that hides or rewrites the log; the log is the
  point.

## Decided by the owner

- **Dev certificates first, then the simulator.**
- **A pretty CLI that says it is an AirRemote mock device.** The banner and
  log look below were approved.
- **It runs as a prompt with `/` commands; `/help` shows them all.**
- **`/enroll` starts the enroll flow.**
- **Everything sent to and received from the server is logged.**
- **It talks to the dev server and does only what a real device does.** The
  owner calls `POST /devices` themselves.
- **Custom messages can be sent.**
- **After showing the code, it keeps retrying `/ws` on its own**, like the
  real device.

## Part 1 — `scripts/dev-certs.sh`

A bash script using `openssl`, EC P-256 keys, in a new `scripts/` folder at
the repository root.

### `scripts/dev-certs.sh` (no arguments)

- Creates in `certs/` (already git-ignored; Compose mounts it at `/certs`):
  - `device-ca.crt`, `device-ca.key` — the device CA.
    `basicConstraints=critical,CA:TRUE`,
    `keyUsage=critical,keyCertSign,cRLSign`.
  - `device-server.crt`, `device-server.key` — signed by that CA, CN
    `localhost`, `subjectAltName=DNS:localhost,IP:127.0.0.1`,
    `extendedKeyUsage=serverAuth`.
- An existing CA is kept; the server certificate is re-issued from it. With
  `--force`, the CA is replaced too, and the script says that every
  existing device certificate is now invalid (and deletes `certs/devices/`).
- Prints the `.env` lines for `pnpm dev`, with absolute paths:
  `DEVICE_TLS_CERT_FILE`, `DEVICE_TLS_KEY_FILE`, `DEVICE_TLS_CA_FILE`.
- Keys are written readable by the owner and the group (`0640`) so the
  container user (uid 1000) can read them, as the README already requires.

### `scripts/dev-certs.sh device <MAC>`

- `<MAC>` is `AA:BB:CC:DD:EE:FF` in any case; it is normalised to upper case
  (as a factory would print it). Anything else is refused with a usage line.
- Requires the CA (else tells you to run the script without arguments
  first).
- Writes `certs/devices/<MAC with colons replaced by dashes>.crt` and `.key`,
  e.g. `AA-BB-CC-DD-EE-01.crt`, signed by the CA, CN = the MAC,
  `extendedKeyUsage=clientAuth`. Re-running replaces that device's
  certificate.

### Validity

CA 10 years, server and device certificates 2 years. These are dev
certificates; long lifetimes avoid surprise expiries.

### Exit behaviour

`set -euo pipefail`; a missing `openssl` is a clear error. `--help` prints
usage.

### Output directory

`certs/` at the repository root by default; `--out <dir>` overrides it (used
by the test).

## Part 2 — The device simulator

### Where and how it runs

- A new workspace package `tools/device-sim` (`@airremote/device-sim`,
  private), TypeScript, run with `tsx` like the backend's dev script. The
  workspace (`pnpm-workspace.yaml`), lint, typecheck and the unit test
  project include `tools/*`.
- Root script: `pnpm device-sim --mac AA:BB:CC:DD:EE:01 [--server
  https://localhost:8443] [--certs ./certs]`.
- It reads `certs/device-ca.crt` (to trust the server) and
  `certs/devices/<MAC>.crt|.key`. A missing file is a clear message naming
  the `scripts/dev-certs.sh` command that creates it, and exit code 1.
- It imports `@airremote/contracts` for the protocol (subprotocol name,
  message schemas, pairing-code response schema).

### Look

Approved by the owner:

```
  ╭──────────────────────────────────────────╮
  │   ◉  AirRemote · mock device             │
  │      MAC     AA:BB:CC:DD:EE:01           │
  │      server  https://localhost:8443      │
  ╰──────────────────────────────────────────╯
  12:04:01  ·  connecting to /ws …
  12:04:01  ←  403 Forbidden — not enrolled, run /enroll
  › /enroll
  12:04:09  →  POST /pairing-code
  12:04:09  ←  201 { "pairingCode": "7K4MQ9TX", "expiresAt": "…" }
              [QR code]   code 7K4M-Q9TX · expires in 15:00
  12:04:09  ·  waiting for enrollment, retrying /ws every 5s …
```

- A readline prompt (`›`). Log lines print above it without breaking what
  is being typed.
- Every log line: time, a direction marker (`→` sent, `←` received, `·` the
  device's own status), then the content. Colours distinguish directions,
  errors and status; JSON is printed compactly on one line, pretty-printed
  when long.
- Colours are off when stdout is not a TTY or `NO_COLOR` is set.

### What is logged

- Every HTTP request on the device listener (method, path) and response
  (status, body).
- Every WebSocket frame both ways, as sent/received (invalid text too).
- Pings and pongs, dimmed.
- Upgrade refusals with their status (`403 Forbidden — not enrolled`).
- Closes with their code and meaning: `1000` normal, `1001` server shutting
  down, `1007` invalid UTF-8, `1008` too many invalid messages, `1009`
  message too big, `4000` replaced by a newer connection; others raw.
- TLS failures in plain words (e.g. the server does not trust this
  certificate).

### Behaviour — what a real device does

- **On start:** tries `/ws` once. A `403` is "not enrolled — run /enroll".
- **While connected:** answers pings (unless turned off, below).
- **Unexpected close or network error after being connected** (server
  restart, `1001`, `4000`, connection lost): reconnects with backoff — 1 s,
  doubling, at most 30 s — and logs each attempt. A `403` on reconnect
  (device removed) stops reconnecting with "not enrolled".
- **`/enroll`:**
  1. `POST /pairing-code`. A `409` is "already enrolled", and the device
     connects. Other errors are shown and the flow stops.
  2. Shows the code grouped for reading (`7K4M-Q9TX`), the time left, and a
     QR code in the terminal.
  3. Retries `/ws` every 5 s. Each refused attempt is logged (dimmed, so
     the wait stays readable). When accepted: "enrolled ✓ connected". When
     the code expires: "pairing code expired — run /enroll again".
  4. Any command still works while waiting; `/enroll` again replaces the
     code (as the server does); `/disconnect` stops the wait.

### Commands

| Command            | Does                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| `/help`            | Lists the commands.                                                                    |
| `/enroll`          | The enrollment flow above.                                                             |
| `/connect`         | Opens `/ws` now (and resumes reconnecting).                                            |
| `/disconnect`      | Closes the socket with `1000` and stops reconnecting/waiting, like a network cable out. |
| `/send <text>`     | Sends `<text>` exactly as a text frame, unvalidated.                                   |
| `/error <message>` | Sends `{ "type": "error", "message": … }`, validated against `deviceMessageSchema`.     |
| `/pongs on\|off`   | Answer pings or not; off lets the server's heartbeat drop the device.                  |
| `/status`          | MAC, server, connection state, pending code and its time left, pongs on/off.           |
| `/quit`            | Closes the socket with `1000` and exits. `Ctrl+C` and `Ctrl+D` do the same.            |

- An unknown command or plain text: "unknown command, type /help".
- `/send` and `/error` when not connected: "not connected".
- A `/error` message that fails the schema is refused locally with the
  schema's reason, and nothing is sent; `/send` is the way to send invalid
  frames.
- When a new device message type is added to the protocol, it gets its own
  command like `/error`.

### QR code content

`airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX`. Nothing reads it
yet; it is the simulator's proposal for what the real device will encode,
and moves into `@airremote/contracts` when the UI that scans it is built.

## Testing

- `dev-certs.sh`: a test in the e2e project (it needs `openssl`, which that
  project already uses) that runs the script with `--out` in a temporary
  directory and checks with `openssl` that the server and a device
  certificate chain to the CA, the device CN is the upper-cased MAC,
  re-running keeps the CA, `--force` replaces it, and a bad MAC is refused.
- Simulator, unit tests (in `tools/device-sim/src/**/__tests__`, part of the
  unit project): command parsing, the close-code descriptions, the code
  grouping and QR content, the log line formatting, and the device's
  behaviour (start, enroll and wait, expiry, reconnect backoff, `/pongs`)
  against a fake transport and a fake clock.
- One e2e test in `tools/device-sim/e2e/` (added to the e2e project) runs
  the simulator's device logic against the real device server, using
  `useDeviceServer({ api: true })` from `backend/e2e/support/` by relative
  import: enroll, the owner enrolls over the API, the simulator connects on
  its own. The device logic takes certificate and key contents, not paths,
  so the test can use the run's generated certificates.
- A manual check against `pnpm dev` with certificates from the script.

## Calls made in design, not by the owner

- Bash + `openssl` for the script; `scripts/` at the root.
- Certificate file names, the `certs/devices/` folder, the dash-separated
  MAC in device file names, validity periods, `0640` keys, `--force`.
- Upper-case MAC as the device CN, as a factory would print it.
- TypeScript in `tools/device-sim`, run with `tsx`, a readline prompt
  rather than a full-screen UI.
- Reconnect backoff 1 s → 30 s; enrollment retry every 5 s.
- The full command list beyond `/help` and `/enroll`.
- The QR content format.
- Where the two new tests live, and `--out` on the script.

## Left to the builder

- The terminal libraries (colours, QR), within: no full-screen UI.
- How the device logic is split from the terminal so it can be tested
  without a terminal.
- The exact wording of messages other than those given above.
