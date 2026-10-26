# Dev Certificates and Device Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `scripts/dev-certs.sh` that creates the device listener's certificates and issues device certificates, then an interactive `pnpm device-sim` that behaves like a real AirRemote device against the dev server and logs everything it sends and receives.

**Architecture:** The script is plain bash + `openssl`. The simulator is a workspace package `tools/device-sim` in three layers: a terminal-free **device** (`createDevice`) that holds all behaviour and talks to a `Transport` and a `Clock`; a **node transport** (`node:https` + `ws`) for the real listener; and a **terminal** (readline + colours + QR) that parses `/` commands, calls the device and prints its events. Unit tests drive the device with a fake transport and clock; one e2e test drives it with the real transport against the real device server.

**Tech Stack:** bash, OpenSSL, Node 24, TypeScript, `tsx`, `ws`, `qrcode`, `picocolors`, `node:readline`, `node:util` `parseArgs`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-dev-certs-and-device-simulator-design.md`

## Global Constraints

- Follow `CLAUDE.md`; never touch `legacy/`. No change to how the backend runs.
- Certificates: EC P-256. CA 10 years (`3650` days), server and device 2 years (`730` days). Keys `0640`.
- File names (exact): `device-ca.crt`, `device-ca.key`, `device-server.crt`, `device-server.key`, `devices/<AA-BB-CC-DD-EE-FF>.crt|.key`. Default output dir: `certs/` at the repo root.
- Device CN: the MAC in upper case with colons. Server cert: CN `localhost`, SAN `DNS:localhost,IP:127.0.0.1`.
- Simulator defaults: server `https://localhost:8443`, certs dir `./certs` (relative to the repo root). Subprotocol from `DEVICE_SUBPROTOCOL`.
- Timings: enrollment retry **5 s**; reconnect backoff **1 s doubling to 30 s**, reset after a successful connect.
- QR content: `airremote://pair?mac=<MAC upper case>&code=<code>`. Code shown as `XXXX-XXXX`.
- Close descriptions (exact): `1000` "normal closure", `1001` "server shutting down", `1007` "invalid UTF-8", `1008` "too many invalid messages", `1009` "message too big", `4000` "replaced by a newer connection"; others: the code alone.
- Messages (exact): `not enrolled — run /enroll`, `already enrolled`, `enrolled ✓ connected`, `pairing code expired — run /enroll again`, `not connected`, `unknown command, type /help`.
- Colours off when stdout is not a TTY or `NO_COLOR` is set.
- Commit messages: plain imperative sentence, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line. Before each commit: `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --check .` clean — run each on its own, not piped.

## Review Focus

1. **Server down when the simulator starts** (connection refused, not a 403): it keeps retrying with backoff, never crashes, and a later `pnpm dev` start is picked up. → Task 3 unit "retries with backoff when the server is unreachable on start".
2. **Server restart while connected** (`1001`, then connection refused for a while): reconnects once the server is back, backoff capped at 30 s. → Task 3 unit "reconnects with backoff after an unexpected close, capped at 30 s".
3. **Log lines arriving while you type** (pings, retries): the half-typed command and the prompt are redrawn, not corrupted. → Task 5 manual check, step "type slowly during /enroll retries".
4. **Wrong `--mac` or missing certificate files:** one clear line naming the exact `scripts/dev-certs.sh` command to run, exit 1, no stack trace. → Task 2 unit tests on `loadIdentity` and `parseCliArgs`.
5. **Ctrl+C during the enroll wait or a reconnect backoff:** the process exits at once (no timer keeps it alive) and closes the socket with `1000`. → Task 3 unit "stop clears every timer and closes with 1000" + Task 5 manual check.

---

### Task 1: `scripts/dev-certs.sh`

**Files:**
- Create: `scripts/dev-certs.sh` (executable)
- Create: `backend/e2e/dev-certs.e2e.ts` (typechecked by the backend's tsconfig, matched by the existing e2e glob)
- Modify: `backend/README.md` ("Device listener": a "Dev certificates" paragraph)

**Interfaces:**
- Produces (CLI):
  - `scripts/dev-certs.sh [--out DIR] [--force]` — CA (kept if present unless `--force`) and server certificate; prints the three `DEVICE_TLS_*=` lines with absolute paths.
  - `scripts/dev-certs.sh [--out DIR] device <MAC>` — device certificate.
  - `--help` → usage on stdout, exit 0. Bad MAC, unknown argument, or `device` before a CA exists → message on stderr, exit 1.
  - With `--force`: replaces the CA, deletes `DIR/devices/`, prints that existing device certificates are now invalid.

- [ ] **Step 1: Write the failing test** `backend/e2e/dev-certs.e2e.ts` — each test runs the script (`execFile('bash', [<repo root>/scripts/dev-certs.sh, '--out', dir, ...])`) in a fresh `mkdtemp` dir:
  - "creates a CA and a server certificate that chains to it" — files exist; `openssl verify -CAfile device-ca.crt device-server.crt` → `OK`; stdout has `DEVICE_TLS_CERT_FILE=<dir>/device-server.crt` (and the other two).
  - "issues a device certificate with the upper-cased MAC as CN" — `device aa:bb:cc:dd:ee:01` → `devices/AA-BB-CC-DD-EE-01.crt` verifies against the CA; `openssl x509 -noout -subject -nameopt RFC2253` → `subject=CN=AA:BB:CC:DD:EE:01`.
  - "writes keys readable by owner and group only" — `stat` mode of `device-ca.key`, `device-server.key` and the device key is `0o640`.
  - "keeps the CA when run again" — CA fingerprint unchanged after a second run; the device certificate still verifies.
  - "replaces the CA and removes device certificates with --force" — fingerprint changes; `devices/` gone.
  - "refuses a bad MAC" (`aa-bb-cc-dd-ee-01`) and "refuses a device before the CA exists" — exit code 1, stderr non-empty.
  - "produces certificates the device server accepts" — `buildDeviceServer({ env: testEnv, tls: { cert, key, ca } from the files, db: fakeDb(async () => []), connections: createDeviceConnections() })` on port 0; a `ws` client with the device certificate and `airremote.v1` gets an HTTP `403` upgrade response (TLS accepted, not enrolled).
- [ ] **Step 2: Run** `pnpm vitest run --project e2e backend/e2e/dev-certs.e2e.ts` — Expected: FAIL (script not found).
- [ ] **Step 3: Implement** `scripts/dev-certs.sh`: `set -euo pipefail`; check `openssl` exists; a minimal temporary openssl config so no default extensions are added (as `device-certs.global-setup.ts` does); `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes` with `-CA/-CAkey` for leaves and the extensions from the spec; `chmod 0640` keys; MAC check `^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Document** in `backend/README.md` under "Device listener": run `scripts/dev-certs.sh` (Compose reads `certs/` as is; for `pnpm dev`, paste the printed lines into `.env`), and `scripts/dev-certs.sh device <MAC>` for a device certificate.
- [ ] **Step 6: Commit** — `git commit -m "Add a script that creates dev certificates for the device listener"`.

---

### Task 2: The `tools/device-sim` package and its pure helpers

**Files:**
- Create: `tools/device-sim/package.json`, `tools/device-sim/tsconfig.json`
- Create: `tools/device-sim/src/args.ts`, `identity.ts`, `format.ts`, `commands.ts` (+ `src/__tests__/*.test.ts` for each)
- Modify: `pnpm-workspace.yaml` (`- tools/*`), root `package.json` (script `"device-sim": "pnpm --filter @airremote/device-sim start --"`), `vitest.config.ts` (unit `include` adds `'tools/*/src/**/__tests__/**/*.test.ts'`), `backend/Dockerfile` (`COPY tools/device-sim/package.json tools/device-sim/` before `pnpm install`)

**Interfaces:**
- Package: `@airremote/device-sim`, private, `"type": "module"`, scripts `start` = `tsx src/main.ts`, `typecheck` = `tsc --noEmit -p .`; deps `@airremote/contracts` (`workspace:*`), `ws`, `qrcode`, `picocolors`; dev deps `tsx`, `@types/ws`, `@types/qrcode`. `tsconfig.json` extends the base, `include: ["src", "e2e"]`.
- Produces:
  - `args.ts`: `parseCliArgs(argv: string[]): { ok: true; options: { mac: string; server: string; certsDir: string } } | { ok: false; message: string }` — `--mac` required, any case, normalised to upper case; `--server` default `https://localhost:8443`; `--certs` default `<repo root>/certs` (resolved from the package location). Uses `node:util` `parseArgs`.
  - `identity.ts`: `type Identity = { ca: string; cert: string; key: string }`; `certificateFileName(mac: string): string` → `AA-BB-CC-DD-EE-01`; `loadIdentity(mac: string, certsDir: string): Promise<{ ok: true; identity: Identity } | { ok: false; message: string }>` — missing CA → message containing `scripts/dev-certs.sh`; missing device files → message containing `scripts/dev-certs.sh device <MAC>`.
  - `format.ts`: `groupPairingCode(code: string): string` (`7K4MQ9TX` → `7K4M-Q9TX`); `pairingUri(mac: string, code: string): string`; `describeClose(code: number): string` (exact strings in Global Constraints); `formatRemaining(ms: number): string` (`900000` → `15:00`, `61000` → `1:01`, negative → `0:00`); `describeTransportError(error: { code?: string; message: string }): string` — `ECONNREFUSED` → `server not reachable (connection refused)`; codes containing `ALERT_UNKNOWN_CA`, `ALERT_BAD_CERTIFICATE` or `ALERT_CERTIFICATE_REQUIRED` → `the server does not trust this device's certificate`; `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ERR_TLS_CERT_ALTNAME_INVALID` → `this device does not trust the server's certificate`; anything else → the message.
  - `commands.ts`: `type Command = { name: 'help' } | { name: 'enroll' } | { name: 'connect' } | { name: 'disconnect' } | { name: 'status' } | { name: 'quit' } | { name: 'send'; text: string } | { name: 'error'; message: string } | { name: 'pongs'; on: boolean } | { name: 'usage'; usage: string } | { name: 'unknown' } | { name: 'empty' }`; `parseCommand(line: string): Command`; `COMMAND_HELP: readonly { usage: string; description: string }[]` (the spec's table, in order).

- [ ] **Step 1: Scaffold** the package files, workspace entry, root script, Vitest glob and Dockerfile line; `pnpm install`.
- [ ] **Step 2: Write the failing unit tests:**
  - args: `['--mac','aa:bb:cc:dd:ee:01']` → mac `AA:BB:CC:DD:EE:01`, defaults; missing `--mac` and `--mac aa-bb-…` → `ok: false` with a message naming `--mac AA:BB:CC:DD:EE:FF`; `--server`/`--certs` override.
  - identity (temp dir): all files present → contents; no CA → message includes `scripts/dev-certs.sh`; no device files → message includes `scripts/dev-certs.sh device AA:BB:CC:DD:EE:01`.
  - format: the examples above; `describeTransportError` for each listed code and one unknown code; `pairingUri('AA:BB:CC:DD:EE:01','7K4MQ9TX')` → `airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX`; every close code in Global Constraints, and `4999` → `4999`.
  - commands: each command; `/send hello world` → text `hello world` (rest of line, untrimmed inside); `/send` alone → `usage`; `/error` alone → `usage`; `/pongs on|off`; `/pongs maybe` → `usage`; `/ENROLL` → enroll (case-insensitive name); `hello` and `/nope` → `unknown`; `''`/`'  '` → `empty`.
- [ ] **Step 3: Run** `pnpm vitest run --project unit tools` — Expected: FAIL (modules not found).
- [ ] **Step 4: Implement** the four modules.
- [ ] **Step 5: Run** the Step 3 command — Expected: PASS. Then `docker compose build api` — Expected: builds.
- [ ] **Step 6: Commit** — `git commit -m "Add the device simulator package and its helpers"`.

---

### Task 3: The device

**Files:**
- Create: `tools/device-sim/src/device.ts` (+ `src/__tests__/device.test.ts`)

**Interfaces:**
- Consumes: Task 2 `pairingUri`, `describeClose`; contracts `deviceMessageSchema`, `pairingCodeResponseSchema`.
- Produces:
  ```ts
  type HttpResult = { status: number; body: unknown };
  type SocketEvents = { message(text: string): void; ping(): void; close(code: number, reason: string): void };
  type DeviceSocket = { send(text: string): void; pong(): void; close(code: number, reason: string): void };
  type OpenResult =
    | { ok: true; socket: DeviceSocket }
    | { ok: false; status: number }            // upgrade refused over HTTP
    | { ok: false; error: string };            // network or TLS failure
  type Transport = {
    postPairingCode(): Promise<HttpResult>;
    openSocket(events: SocketEvents): Promise<OpenResult>;
  };
  type Clock = { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  type DeviceEvent =
    | { kind: 'sent'; text: string; dim?: boolean }        // → line
    | { kind: 'received'; text: string; dim?: boolean }    // ← line
    | { kind: 'status'; text: string; tone: 'info' | 'success' | 'error' | 'dim' } // · line
    | { kind: 'pairing'; code: string; expiresAt: number; uri: string };
  type DeviceState = 'offline' | 'connecting' | 'connected' | 'waiting-for-enrollment';
  type DeviceStatus = { mac: string; state: DeviceState; pongs: boolean; pendingCode: { code: string; expiresAt: number } | null };
  createDevice(options: { mac: string; transport: Transport; clock: Clock; onEvent(event: DeviceEvent): void; enrollRetryMs?: number /* 5000 */ }): {
    start(): void; enroll(): Promise<void>; connect(): void; disconnect(): void;
    send(text: string): void; sendError(message: string): void; setPongs(on: boolean): void;
    status(): DeviceStatus; stop(): void;
  }
  ```
- Behaviour (each line is a test in Step 1):
  - `start()`: one open attempt (`· connecting to /ws …`). Accepted → `· connected` (success). `403` → `← 403 Forbidden` then `· not enrolled — run /enroll`; no retry. Any other refusal or `error` → error status line, then reconnect with backoff.
  - Reconnect backoff: delays 1, 2, 4, 8, 16, 30, 30 s…; reset to 1 s after a successful open; each attempt logs `· reconnecting in Ns …`. A `403` during reconnect stops it with the not-enrolled line.
  - Socket `close(code)` not caused by the device → `← close <code> <describeClose>` then reconnect with backoff (covers `1001`, `4000`, `1008`, `1009`). A close the device asked for (`disconnect`, `stop`) → no reconnect.
  - `message(text)` → `received` event with the text exactly. `ping()` → dim `← ping`; with pongs on, `pong()` and dim `→ pong`; with pongs off, nothing sent.
  - `enroll()`: `→ POST /pairing-code`, `← <status> <body JSON>`. `201` (parsed with `pairingCodeResponseSchema`) → `pairing` event with `uri = pairingUri(mac, code)`, state `waiting-for-enrollment`, then every `enrollRetryMs` an open attempt; refusals as dim lines; accepted → `· enrolled ✓ connected` (success), state `connected`; at `expiresAt` → `· pairing code expired — run /enroll again`, retries stop. `409` → `· already enrolled` and a connect. Other status or transport error → error status, flow stops. A second `enroll()` replaces the pending code and restarts the retries.
  - `connect()`: cancels a pending enrollment wait; opens now; re-enables reconnecting.
  - `disconnect()`: closes with `1000`, cancels retries and backoff, state `offline`.
  - `send(text)`: connected → `sent` event + `socket.send(text)` unchanged; otherwise `· not connected` (error), nothing sent.
  - `sendError(message)`: builds `{ type: 'error', message }`; fails `deviceMessageSchema` (e.g. `''`) → error status with the schema's message, nothing sent; else as `send(JSON.stringify(...))`.
  - `stop()`: clears every timer, closes the socket with `1000`; afterwards no timers are pending on the fake clock.

- [ ] **Step 1: Write the failing tests** — a fake transport (scripted `postPairingCode` results and `openSocket` outcomes, recording sockets) and a fake clock (`advance(ms)` runs due timers, `pending()` counts timers); one test per behaviour line above, including "retries with backoff when the server is unreachable on start", "reconnects with backoff after an unexpected close, capped at 30 s" and "stop clears every timer and closes with 1000".
- [ ] **Step 2: Run** `pnpm vitest run --project unit tools/device-sim/src/__tests__/device.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `createDevice`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the simulated device's behaviour"`.

---

### Task 4: The node transport, and the device against the real server

**Files:**
- Create: `tools/device-sim/src/node-transport.ts`
- Create: `tools/device-sim/e2e/device-sim.e2e.ts`
- Modify: `vitest.config.ts` (e2e `include` adds `'tools/*/e2e/**/*.e2e.ts'`)

**Interfaces:**
- Consumes: Task 3 `Transport`, `OpenResult`, `SocketEvents`; Task 2 `Identity`.
- Produces: `createNodeTransport({ server: string; identity: Identity }): Transport` — `postPairingCode` = `node:https` `POST <server>/pairing-code`, no body, no `content-type`, `agent: false`, with `ca/cert/key`; the body is JSON-parsed when it is JSON, else the raw text. `openSocket` = `new WebSocket(<server as wss>/ws, [DEVICE_SUBPROTOCOL], { ca, cert, key, autoPong: false })`; `open` → `ok: true`; `unexpected-response` → `{ ok: false, status }`; `error` before open → `{ ok: false, error: describeTransportError(error) }` (also for `postPairingCode` failures, which reject with that text); events wired to `SocketEvents` (`message` as UTF-8 text, `ping`, `close`).
- Plus `systemClock: Clock`.

- [ ] **Step 1: Write the failing e2e test** with `useDeviceServer({ api: true })` (relative import from `backend/e2e/support/device-server.ts`), identity from `inject('deviceCerts')` (`ca`, client `allowed`), server origin derived from `device.url`, `enrollRetryMs: 200`, events collected in an array with a `waitFor(predicate, timeoutMs)` helper:
  - "starts unenrolled": `start()` → a `not enrolled — run /enroll` status.
  - "enrolls once the owner has enrolled it": `enroll()` → `pairing` event; the test registers and logs in a user over `device.apiUrl` and `POST /devices` with `aa:bb:cc:dd:ee:01` and the code; then `enrolled ✓ connected`; `sendError('IR receiver timed out')` → a `sent` event and no `received` error reply within 300 ms.
  - "logs the server's error reply to a bad frame": enrolled first (`device.allowDevice`), `start()`, `send('{nope')` → a `received` event whose text parses to `{ type: 'error', code: 'INVALID_JSON' }`.
  - "reports an untrusted certificate": client `foreignCa` → `start()` yields an error status (no crash).
- [ ] **Step 2: Run** `pnpm vitest run --project e2e tools` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `node-transport.ts`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Connect the simulated device to the real device listener"`.

---

### Task 5: The terminal, `main.ts`, docs and a manual run

**Files:**
- Create: `tools/device-sim/src/terminal.ts`, `tools/device-sim/src/main.ts`, `tools/device-sim/README.md`
- Test: `tools/device-sim/src/__tests__/terminal.test.ts`
- Modify: `CLAUDE.md` (workspace now has `tools/device-sim`; `scripts/dev-certs.sh`), `backend/README.md` (point to the simulator)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `terminal.ts`: `renderBanner({ mac, server }): string` (the spec's box); `renderEvent(event: DeviceEvent, time: Date, colors: Colors): Promise<string>` — time `HH:MM:SS`, marker `→`/`←`/`·`, JSON text pretty-printed when longer than 100 characters; a `pairing` event renders the QR (`qrcode` `toString(uri, { type: 'terminal', small: true })`) plus `code XXXX-XXXX · expires in M:SS`; `renderHelp(): string` from `COMMAND_HELP`; `renderStatus(status: DeviceStatus, server: string): string`. `Colors` = `picocolors.createColors(enabled)`.
  - `main.ts`: colours enabled only when `process.stdout.isTTY` and `NO_COLOR` is unset; parse args (bad → message on stderr, exit 1), load identity (bad → message, exit 1), print banner, create transport/device, readline prompt `› ` that prints events above the prompt while preserving the typed line (`clearLine`, `cursorTo`, write, `prompt(true)`), dispatch commands, `/quit` / Ctrl+C / Ctrl+D → `device.stop()` and exit 0; `device.start()`.

- [ ] **Step 1: Write the failing tests** (colours disabled): banner contains `AirRemote · mock device`, the MAC and the server; `renderEvent` for each kind (markers, time, dim/success/error text present); long JSON is multi-line; a pairing event contains `7K4M-Q9TX` and `expires in 15:00`; help lists every `COMMAND_HELP` usage; status shows state, pongs, and the pending code with time left.
- [ ] **Step 2: Run** `pnpm vitest run --project unit tools` — Expected: FAIL.
- [ ] **Step 3: Implement** `terminal.ts` and `main.ts`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Write** `tools/device-sim/README.md` (start, commands, how to enroll with curl: log in, then `POST /devices`), and update `CLAUDE.md` and `backend/README.md`.
- [ ] **Step 6: Manual run** against `pnpm dev` with `scripts/dev-certs.sh` certificates and `device AA:BB:CC:DD:EE:01`; record each result in the ledger:
  - banner and `not enrolled — run /enroll` on start;
  - `/enroll` shows the QR and code; enroll with curl; `enrolled ✓ connected` follows on its own;
  - type slowly during `/enroll` retries — the typed line survives the log lines;
  - `/send {nope` → server `INVALID_JSON` reply logged; `/error hi` sent;
  - stop and restart `pnpm dev` while connected → `close 1001 server shutting down`, reconnects;
  - `/pongs off` → dropped by the heartbeat within ~60 s, then reconnects;
  - Ctrl+C during a backoff → exits at once;
  - start without the server running → retries with backoff; bad `--mac` → one-line message, exit 1.
- [ ] **Step 7: Run** `pnpm lint`, `pnpm typecheck`, `pnpm exec prettier --check .`, `pnpm test`, `pnpm build` — Expected: all clean.
- [ ] **Step 8: Commit** — `git commit -m "Add the device simulator's terminal"`.
