# Device Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second, mTLS-only HTTPS listener in the backend process that accepts WebSocket connections from allowed devices and validates every message in both directions against a Zod protocol in `@airremote/contracts`.

**Architecture:** `server.ts` builds the existing API (`buildApp`) and a new device server (`buildDeviceServer`), sharing one database pool and one connection registry. The device server registers one Fastify plugin, the gateway, which owns `@fastify/websocket`: it checks the subprotocol and the client certificate on upgrade, asks `devicesService.authorizeConnection` whether the device is allowed, and hands each socket to a device session that decodes frames, dispatches valid messages to handlers in `features/devices/devices.socket.ts`, and answers bad frames with `error` messages. Outgoing messages go through the registry, which validates them before sending.

**Tech Stack:** Fastify 5, `@fastify/websocket` 11 (wraps `ws` 8), Node `https`/`tls`, Zod 4, Drizzle, Vitest 5 + Testcontainers, `openssl` (e2e certificate generation only).

**Spec:** `docs/superpowers/specs/2026-10-26-device-gateway-design.md`

## Global Constraints

- Follow `CLAUDE.md`: layer rules, `create*` factories, `__tests__/` next to the code, only `src/config` reads `process.env`, only repositories import `drizzle-orm`.
- Subprotocol name: `airremote.v1`. Route: `GET /ws`.
- Device identity: client certificate Subject CN = MAC address `AA:BB:CC:DD:EE:FF`, any case, colon-separated only.
- Placeholder rule: allowed ⇔ a `devices` row has that MAC. Fails closed.
- Limits and timings: frames over **16 KiB** → close `1009`; **5** bad frames in a row → close `1008`; ping every **30 s**; replaced connection → close `4000` reason `replaced`; shutdown → close `1001`.
- Protocol error codes: `INVALID_JSON`, `INVALID_MESSAGE`, `UNSUPPORTED_FRAME`. Device `error.message`: 1–200 characters.
- Config: `DEVICE_PORT` (default `8443`), `DEVICE_TLS_CERT_FILE`, `DEVICE_TLS_KEY_FILE`, `DEVICE_TLS_CA_FILE` — all three or none.
- Compose: fixed container files `/certs/device-server.crt`, `/certs/device-server.key`, `/certs/device-ca.crt`; mount `./certs:/certs:ro,z`.
- No `scripts/dev-certs.sh`, no committed private keys, no command messages, no onboarding.
- Never log certificate contents.
- Commit messages follow the repo style (plain imperative sentence, e.g. "Add login, refresh and logout endpoints") and end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line.
- Before each commit: `pnpm typecheck && pnpm lint` clean, and `pnpm exec prettier --check .` clean.

## Review Focus

1. A socket `error` event (oversized frame, invalid UTF-8) must never crash the process; the server keeps accepting connections afterwards. → Task 6 e2e "accepts new connections after closing an oversized frame".
2. The heartbeat racing a close: pinging a socket that has already closed must not throw or keep it in the heartbeat set. → Task 5 unit "does nothing on heartbeat after the socket closed".
3. A handler that throws synchronously, or returns a rejected promise, is logged and the socket stays open. → Task 5 unit tests (both forms).
4. A certificate with two CN attributes (even if the first is an allowed MAC) is rejected with `403`. → Task 6 e2e.
5. The device port already in use at startup makes the process exit 1 with both servers and the pool closed, instead of an API running without devices. → Task 7 manual verification step.

---

### Task 1: Device protocol contract

**Files:**
- Create: `packages/contracts/src/device-protocol/device-protocol.contract.ts`
- Create: `packages/contracts/src/device-protocol/__tests__/device-protocol.contract.test.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from './device-protocol/device-protocol.contract';`)

**Interfaces:**
- Produces:
  - `DEVICE_SUBPROTOCOL = 'airremote.v1'` (const)
  - `deviceProtocolErrorCodeSchema = z.enum(['INVALID_JSON','INVALID_MESSAGE','UNSUPPORTED_FRAME'])`, type `DeviceProtocolErrorCode`
  - `deviceMessageSchema` — `z.discriminatedUnion('type', [z.strictObject({ type: z.literal('error'), message: z.string().min(1).max(200) })])`, type `DeviceMessage`
  - `serverMessageSchema` — `z.discriminatedUnion('type', [z.strictObject({ type: z.literal('error'), code: deviceProtocolErrorCodeSchema, message: z.string().min(1).max(200) })])`, type `ServerMessage`

- [ ] **Step 1: Write the failing tests**

```ts
describe('deviceMessageSchema', () => {
  it('accepts a device error report', () => {
    const msg = { type: 'error', message: 'IR receiver timed out' };
    expect(deviceMessageSchema.parse(msg)).toEqual(msg);
  });
  it('rejects unknown keys, unknown types, and empty or over-200-character messages', () => {
    for (const bad of [
      { type: 'error', message: 'x', extra: 1 },
      { type: 'hello' },
      { type: 'error', message: '' },
      { type: 'error', message: 'x'.repeat(201) },
      { message: 'x' },
    ]) expect(deviceMessageSchema.safeParse(bad).success).toBe(false);
  });
});

describe('serverMessageSchema', () => {
  it('accepts an error with a protocol error code', () => { /* each of the 3 codes parses */ });
  it('rejects an unknown code or unknown keys', () => { /* code 'NOPE'; extra key */ });
});

it('names the subprotocol airremote.v1', () => {
  expect(DEVICE_SUBPROTOCOL).toBe('airremote.v1');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project unit packages/contracts/src/device-protocol`
Expected: FAIL — cannot resolve `../device-protocol.contract`.

- [ ] **Step 3: Implement the contract** as listed under Interfaces, with JSDoc on each schema saying which direction it covers. Re-export from `index.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --project unit packages/contracts/src/device-protocol`
Expected: PASS.

- [ ] **Step 5: Commit** — "Add the device protocol contract".

---

### Task 2: Device listener configuration

**Files:**
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/config/device-tls.ts`
- Modify: `backend/src/config/__tests__/env.test.ts`
- Create: `backend/src/config/__tests__/device-tls.test.ts`
- Modify: `backend/src/__tests__/test-utils.ts` (`testEnv` gains `DEVICE_PORT: 0`)
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `Env` gains `DEVICE_PORT: number` (coerced int 0–65535, default `8443`) and optional `DEVICE_TLS_CERT_FILE`, `DEVICE_TLS_KEY_FILE`, `DEVICE_TLS_CA_FILE: string | undefined` (non-empty when present).
  - `type DeviceTls = { cert: Buffer; key: Buffer; ca: Buffer }`
  - `loadDeviceTls(env: Env): Promise<DeviceTls | null>` — `null` when none of the three are set; otherwise reads all three; throws `ConfigError` listing **every** unreadable file as `  - <VAR>: cannot read <path> (<error code>)` under the heading `Invalid environment configuration:`.

- [ ] **Step 1: Write the failing tests**

In `env.test.ts` (add to the existing suite, reusing its valid base env):
- `defaults DEVICE_PORT to 8443`
- `accepts all three DEVICE_TLS_* files or none`
- `rejects a partial DEVICE_TLS_* set, naming each missing variable` — set only `DEVICE_TLS_CERT_FILE`; expect `ConfigError` whose message contains `DEVICE_TLS_KEY_FILE` and `DEVICE_TLS_CA_FILE` and `must be set together with`.
- `treats blank DEVICE_TLS_* values as unset` — all three `''` → no error, all `undefined`.

In `device-tls.test.ts` (temp files under `mkdtemp(join(tmpdir(), 'device-tls-'))`, removed in `afterEach`):
- `returns null when no DEVICE_TLS_* file is set`
- `reads the three files` — contents equal the written bytes.
- `throws a ConfigError naming every unreadable file` — two missing paths; message contains both variable names and both paths, and `ENOENT`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project unit backend/src/config`
Expected: FAIL — `DEVICE_PORT` undefined; `device-tls` module missing.

- [ ] **Step 3: Implement** the schema additions (an extra `.superRefine` that adds one issue per missing variable when 1 or 2 of the three are set: `must be set together with <the other two>`), `loadDeviceTls` (read with `fs/promises.readFile` in parallel, collect failures, then throw), and `testEnv.DEVICE_PORT = 0`.

- [ ] **Step 4: Update `.env.example`**: a commented block after the JWT secrets:

```
# Device listener (mTLS WebSockets). Port devices connect to.
DEVICE_PORT=8443
# Server certificate, its key, and the CA that signs device certificates (PEM).
# Set all three or none; none keeps the device listener off. Host paths, used by
# `pnpm dev` (absolute recommended). Docker Compose expects the files in ./certs
# as device-server.crt, device-server.key and device-ca.crt.
DEVICE_TLS_CERT_FILE=
DEVICE_TLS_KEY_FILE=
DEVICE_TLS_CA_FILE=
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run --project unit backend/src/config && pnpm typecheck`
Expected: PASS; typecheck clean (other `Env` literals in tests updated if needed).

- [ ] **Step 6: Commit** — "Add device listener configuration".

---

### Task 3: Device message codec and connection registry

**Files:**
- Create: `backend/src/shared/device-messages.ts`
- Create: `backend/src/shared/device-connections.ts`
- Create: `backend/src/shared/__tests__/device-messages.test.ts`
- Create: `backend/src/shared/__tests__/device-connections.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas and types.
- Produces, in `device-messages.ts`:
  - `type AuthorizedDevice = { id: string; macAddress: string }`
  - `type DeviceMessageContext = { device: AuthorizedDevice; log: FastifyBaseLogger }`
  - `type DeviceMessageHandlers = { [T in DeviceMessage['type']]: (message: Extract<DeviceMessage, { type: T }>, ctx: DeviceMessageContext) => Promise<void> }`
  - `type DecodedFrame = { ok: true; message: DeviceMessage } | { ok: false; code: DeviceProtocolErrorCode; detail: string }`
  - `decodeDeviceFrame(data: Buffer, isBinary: boolean): DecodedFrame`
  - `class InvalidServerMessageError extends Error`
  - `encodeServerMessage(message: ServerMessage): string` — validates with `serverMessageSchema`, throws `InvalidServerMessageError` (message includes the first issue) on failure, else `JSON.stringify` of the parsed value.
- Produces, in `device-connections.ts`:
  - `type DeviceSocket = { send(data: string): void; close(code: number, reason: string): void }`
  - `type DeviceConnections = { register(deviceId: string, socket: DeviceSocket): void; unregister(deviceId: string, socket: DeviceSocket): void; send(deviceId: string, message: ServerMessage): boolean; isConnected(deviceId: string): boolean }`
  - `createDeviceConnections(): DeviceConnections`

Exact `detail` strings (they become the `message` of the `error` reply):
- binary: `Binary frames are not supported`
- not JSON: `Message is not valid JSON`
- schema failure: `<path joined by '.'>: <issue message>` for the first issue, or just the issue message when the path is empty; truncated to 200 characters.

- [ ] **Step 1: Write the failing tests**

`device-messages.test.ts`:
- `decodes a valid text frame` → `{ ok: true, message }`.
- `rejects a binary frame with UNSUPPORTED_FRAME` (even if its bytes are valid JSON).
- `rejects text that is not JSON with INVALID_JSON`.
- `rejects JSON that fails the schema with INVALID_MESSAGE and names the first problem` — `{type:'error', message: 1}` → detail starts with `message:`.
- `keeps INVALID_MESSAGE details within 200 characters` — a payload whose issue text is long (e.g. unknown key with a 300-char name) → `detail.length <= 200`.
- `encodes a valid server message as JSON`.
- `throws InvalidServerMessageError for a message that fails the schema` — cast `{ type: 'error', code: 'NOPE', message: 'x' } as unknown as ServerMessage`.

`device-connections.test.ts` (fake socket: `{ send: vi.fn(), close: vi.fn() }`):
- `sends a validated message to a registered device and returns true` — `send` called once with the JSON string.
- `returns false when the device is not connected`.
- `throws and sends nothing when the message is invalid`.
- `closes the previous socket with 4000 "replaced" when a device registers again` — `isConnected` stays true, new socket receives later sends.
- `ignores an unregister for a socket that was already replaced` — unregister(old) after register(new) → still connected, sends go to new.
- `unregisters the current socket`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project unit backend/src/shared`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement** both modules (registry: a `Map<string, DeviceSocket>`; `send` calls `encodeServerMessage` before looking anything up so invalid messages always throw).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --project unit backend/src/shared`
Expected: PASS.

- [ ] **Step 5: Commit** — "Add the device message codec and connection registry".

---

### Task 4: Devices feature (allowlist placeholder and message handlers)

**Files:**
- Create: `backend/src/features/devices/devices.helpers.ts`
- Create: `backend/src/features/devices/devices.repository.ts`
- Create: `backend/src/features/devices/devices.service.ts`
- Create: `backend/src/features/devices/devices.socket.ts`
- Create: `backend/src/features/devices/__tests__/devices.helpers.test.ts`
- Create: `backend/src/features/devices/__tests__/devices.repository.itest.ts`
- Create: `backend/src/features/devices/__tests__/devices.service.test.ts`
- Create: `backend/src/features/devices/__tests__/devices.socket.test.ts`

**Interfaces:**
- Consumes: `AuthorizedDevice`, `DeviceMessageHandlers` (Task 3); `devices`, `Device`, `Database` from `@airremote/db`.
- Produces:
  - `parseMacAddress(value: string): string | null` — `/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i`, returns lower-case, else `null`.
  - `type DevicesRepository = { findByMacAddress(macAddress: string): Promise<Device | null> }`, `createDevicesRepository(db: Database)`.
  - `type DevicesService = { authorizeConnection(commonName: string): Promise<AuthorizedDevice | null> }`, `createDevicesService({ repository }: { repository: DevicesRepository })`.
  - `createDevicesSocketHandlers(): DeviceMessageHandlers`.

`authorizeConnection` is the onboarding placeholder. Its JSDoc says: the certificate CN must be a MAC address; for now a device is allowed when a `devices` row has that MAC; onboarding replaces this rule. A repository error propagates (the gateway treats any throw as a rejection — fail closed).

- [ ] **Step 1: Write the failing tests**

`devices.helpers.test.ts`:
- `accepts a colon-separated MAC in any case and returns it lower-case` — `'AA:bb:CC:dd:EE:0f'` → `'aa:bb:cc:dd:ee:0f'`.
- `rejects anything else` — `''`, `'aabbccddeeff'`, `'AA-BB-CC-DD-EE-FF'`, `'AA:BB:CC:DD:EE'`, `'AA:BB:CC:DD:EE:FF:00'`, `'GG:BB:CC:DD:EE:FF'`, `' AA:BB:CC:DD:EE:FF'`.

`devices.service.test.ts` (inline fake repository with a `vi.fn()` `findByMacAddress`):
- `allows a device whose MAC has a devices row` → `{ id, macAddress }`.
- `looks the MAC up in lower case`.
- `rejects a device with no row` → `null`.
- `rejects a common name that is not a MAC without querying` → `null`, repository not called.
- `fails closed when the lookup throws` → `rejects.toThrow()` (never resolves to a device).

`devices.repository.itest.ts` (`useTestDatabase()`; insert a user, then a device with `macAddress: 'aa:bb:cc:dd:ee:01'`):
- `finds a device by MAC address` → row with that id.
- `matches a MAC given in a different case` — lookup `'AA:BB:CC:DD:EE:01'` finds it.
- `returns null for an unknown MAC`.

`devices.socket.test.ts`:
- `logs a device error report as a warning` — fake `log = { warn: vi.fn() }`; `await handlers.error({ type:'error', message:'boom' }, { device, log })`; `warn` called with an object containing `deviceMessage: 'boom'` and the string `'Device reported an error'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project unit backend/src/features/devices && pnpm vitest run --project integration backend/src/features/devices`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement** the four modules. The repository uses `eq(devices.macAddress, macAddress)` (Postgres compares `macaddr` values, so case does not matter).

- [ ] **Step 4: Run to verify it passes**

Run: same as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit** — "Add the devices feature with the connection allowlist placeholder".

---

### Task 5: Device session (frame handling and heartbeat)

**Files:**
- Create: `backend/src/plugins/device-session.ts`
- Create: `backend/src/plugins/__tests__/device-session.test.ts`

**Interfaces:**
- Consumes: `decodeDeviceFrame`, `encodeServerMessage`, `DeviceMessageHandlers`, `AuthorizedDevice` (Task 3); `DeviceConnections`, `DeviceSocket` (Task 3).
- Produces:
  - `type SessionSocket = DeviceSocket & { on(event: string, listener: (...args: any[]) => void): unknown; ping(): void; terminate(): void; readonly readyState: number }` — structural, so `ws`'s `WebSocket` satisfies it and this file does not import `ws`.
  - `type DeviceSession = { heartbeat(): void; readonly closed: boolean }`
  - `attachDeviceSession(socket: SessionSocket, deps: { device: AuthorizedDevice; handlers: DeviceMessageHandlers; connections: DeviceConnections; log: FastifyBaseLogger }): DeviceSession`
  - `MAX_BAD_FRAMES = 5`

Behaviour:
- On attach: `connections.register(device.id, socket)`; log `info` `Device connected` with `deviceId`, `macAddress`.
- `message (data, isBinary)`: normalise `data` (`Buffer | ArrayBuffer | Buffer[]`) to one `Buffer`, decode. Bad → increment the counter, reply `encodeServerMessage({ type:'error', code, message: detail })` straight to `socket.send`, log `warn`; on the 5th consecutive bad frame close with `1008`, reason `too many invalid messages`, after sending that frame's reply. Good → reset the counter, call the handler for `message.type` inside `try`, attach `.catch` to its promise; a sync throw or a rejection is logged at `error` and nothing is sent.
- `pong` → mark alive.
- `error` → log `warn` (this listener is what keeps `ws` errors, e.g. an oversized frame, from crashing the process).
- `close (code)` → `connections.unregister(device.id, socket)`, mark closed, log `info` `Device disconnected` with `code`.
- `heartbeat()`: if closed or `socket.readyState !== 1` → do nothing; if not alive since the last heartbeat → `terminate()`; else mark not alive and `ping()`. Alive starts `true`.

- [ ] **Step 1: Write the failing tests**

Fake socket: an `EventEmitter` plus `send`, `close`, `ping`, `terminate` as `vi.fn()` and `readyState = 1`; `connections = createDeviceConnections()`; a silent logger with spies (`{ info: vi.fn(), warn: vi.fn(), error: vi.fn() }` cast). Helper `text(obj)` → `[Buffer.from(JSON.stringify(obj)), false]`.

- `registers the socket for the device on attach` — `connections.isConnected(device.id)` is true.
- `dispatches a valid message to its handler with the device context`.
- `replies UNSUPPORTED_FRAME to a binary frame` — `send` received `{"type":"error","code":"UNSUPPORTED_FRAME","message":"Binary frames are not supported"}` (parse and compare).
- `replies INVALID_JSON to text that is not JSON`.
- `replies INVALID_MESSAGE to a message that fails the schema`.
- `closes with 1008 after 5 bad frames in a row` — 4 bad → `close` not called; 5th → `close(1008, 'too many invalid messages')` and 5 replies sent.
- `resets the bad-frame count after a valid frame` — 4 bad, 1 good, 4 bad → not closed.
- `keeps the socket open when a handler rejects` and `keeps the socket open when a handler throws synchronously` — `log.error` called, `close` not called, nothing sent.
- `unregisters on close` — emit `close`, `isConnected` false.
- `does not unregister a newer socket when a replaced one closes` — attach A, attach B for the same device, emit `close` on A → still connected; a `connections.send` reaches B.
- `pings on heartbeat and terminates a socket that missed the previous pong` — heartbeat → `ping` 1×; heartbeat again (no pong) → `terminate` 1×.
- `keeps a socket that answered the ping` — heartbeat, emit `pong`, heartbeat → `ping` 2×, no `terminate`.
- `does nothing on heartbeat after the socket closed` — emit `close`, set `readyState = 3`, heartbeat → no `ping`, no `terminate`, no throw.
- `logs socket errors instead of throwing` — `socket.emit('error', new Error('Max payload size exceeded'))` does not throw; `log.warn` called.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project unit backend/src/plugins/__tests__/device-session.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `attachDeviceSession`** per Behaviour.

- [ ] **Step 4: Run to verify it passes**

Run: same as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit** — "Add the device session that validates and dispatches frames".

---

### Task 6: Gateway plugin and device server over mTLS

**Files:**
- Create: `backend/src/config/logger.ts` — `loggerOptions(env: Env): FastifyServerOptions['logger']` (moved from `app.ts`; `app.ts` uses it)
- Modify: `backend/src/app.ts`
- Create: `backend/src/plugins/device-gateway.ts`
- Create: `backend/src/device-server.ts`
- Modify: `eslint.config.js`
- Modify: `backend/package.json` (dependency `@fastify/websocket@^11.3.4`; devDependencies `ws@^8.22.0`, `@types/ws@^8.18.2`)
- Modify: `vitest.config.ts` (e2e `globalSetup` adds `backend/e2e/support/device-certs.global-setup.ts`)
- Create: `backend/e2e/support/device-certs.global-setup.ts`
- Create: `backend/e2e/support/device-server.ts`
- Create: `backend/e2e/device-handshake.e2e.ts`
- Create: `backend/e2e/device-messages.e2e.ts`
- Create: `backend/e2e/device-connections.e2e.ts`

**Interfaces:**
- Consumes: `DEVICE_SUBPROTOCOL` (Task 1); `DeviceTls` (Task 2); `DeviceConnections`, `AuthorizedDevice`, `DeviceMessageHandlers` (Task 3); `createDevicesRepository`, `createDevicesService`, `DevicesService`, `createDevicesSocketHandlers` (Task 4); `attachDeviceSession`, `DeviceSession` (Task 5).
- Produces:
  - `deviceGatewayPlugin: FastifyPluginAsync<{ authorize(commonName: string): Promise<AuthorizedDevice | null>; handlers: DeviceMessageHandlers; connections: DeviceConnections; heartbeatIntervalMs: number }>` (wrapped with `fastify-plugin`).
  - `type BuildDeviceServerOptions = { env: Env; tls: DeviceTls; db: DbHandle; connections: DeviceConnections; heartbeatIntervalMs?: number /* default 30_000 */; service?: DevicesService }`
  - `buildDeviceServer(options: BuildDeviceServerOptions): Promise<FastifyInstance>` — does not listen and never closes `db`.
  - E2E: `useDeviceServer(options?: { heartbeatIntervalMs?: number }): { readonly url: string; readonly server: FastifyInstance; allowDevice(macAddress: string): Promise<string>; connect(cert: TestClientName | null, options?: { protocol?: string | null; autoPong?: boolean }): Promise<WebSocket> }`. `connect` resolves on `open`; rejects with an `UpgradeRejectedError` carrying `status` on `unexpected-response`, or with the underlying error when TLS fails.

**`buildDeviceServer`:** `Fastify({ logger: loggerOptions(env), https: { ...tls, requestCert: true, rejectUnauthorized: true } })`; registers `errorHandlerPlugin` (so unknown paths get the `404 NOT_FOUND` envelope) and `deviceGatewayPlugin` with `authorize` = `(service ?? createDevicesService({ repository: createDevicesRepository(db.db) })).authorizeConnection`, `handlers` = `createDevicesSocketHandlers()`.

**`deviceGatewayPlugin`:**
- Registers `@fastify/websocket` with `options: { maxPayload: 16 * 1024 }` and a `preClose` that closes every client with `1001`, reason `server shutting down`, then closes the `ws` server.
- Route `GET /ws` with `{ websocket: true, preValidation }`. `preValidation`, in order, each rejection answering with an empty body and `Connection: close`, logged at `warn` with the reason (and MAC when known):
  1. `sec-websocket-protocol` header (comma-separated list, trimmed) does not include `airremote.v1` → `400`.
  2. `(request.raw.socket as TLSSocket).getPeerCertificate().subject?.CN` is not a single string → `403`.
  3. `authorize(cn)` resolves `null` **or throws** (log the error at `error`) → `403`.
  4. Otherwise store the device on the request (`decorateRequest('device', null)`).
- `ws` server option `handleProtocols: () => DEVICE_SUBPROTOCOL` so the accepted subprotocol is echoed.
- Handler: `attachDeviceSession(socket, { device, handlers, connections, log: request.log.child({ deviceId }) })`; keep the session in a `Set`, remove it on socket `close`.
- `setInterval(() => sessions.forEach(s => s.heartbeat()), heartbeatIntervalMs)`, `unref()`'d, cleared in `onClose`.

**ESLint:** add a block for `backend/src/**/*.ts` ignoring `backend/src/plugins/device-gateway.ts` and `**/__tests__/**` with `@typescript-eslint/no-restricted-imports` restricting `ws` and `@fastify/websocket` (message: `Only plugins/device-gateway.ts touches sockets.`). Using the typescript-eslint rule keeps it independent of the existing `no-restricted-imports` Drizzle rule (two configs of the same rule on one file replace each other).

**Certificates (global setup):** `openssl` via `execFile` into `mkdtemp(join(tmpdir(), 'airremote-certs-'))`, removed on teardown; EC P-256 keys, 1-day validity. It `provide`s `deviceCerts: { ca: string; serverCert: string; serverKey: string; clients: Record<TestClientName, { cert: string; key: string }> }` (PEM strings; declare it in `ProvidedContext`). Certificates:
- device CA; server certificate signed by it with `subjectAltName = DNS:localhost, IP:127.0.0.1`;
- clients, all `extendedKeyUsage = clientAuth`: `allowed` CN `AA:BB:CC:DD:EE:01` and `allowedLowerCase` CN `aa:bb:cc:dd:ee:01`; `unknown` CN `AA:BB:CC:DD:EE:02`; `notAMac` CN `device-01`; `twoCommonNames` subject `/CN=AA:BB:CC:DD:EE:01/CN=AA:BB:CC:DD:EE:03`; `foreignCa` CN `AA:BB:CC:DD:EE:01` signed by a second, unrelated CA.
- `type TestClientName = 'allowed' | 'allowedLowerCase' | 'unknown' | 'notAMac' | 'twoCommonNames' | 'foreignCa'`.

**`useDeviceServer`:** per file — `createTestDatabase()`, `createDb(url)`, `createDeviceConnections()`, `buildDeviceServer({ env: testEnv, tls: from inject('deviceCerts'), db, connections, heartbeatIntervalMs })`, `listen({ host: '127.0.0.1', port: 0 })`; `url` is `wss://localhost:<port>/ws`. Truncate before each test; close any sockets the test opened after each test; in `afterAll` close the server, the handle, drop the database. `allowDevice` inserts a user and a device with that MAC (Drizzle directly) and returns the device id. `connect` uses `new WebSocket(url, protocol === null ? [] : [protocol ?? 'airremote.v1'], { ca, cert, key, autoPong })` with no `cert`/`key` when `cert` is `null`.

- [ ] **Step 1: Add dependencies and the ESLint rule**

Run: `pnpm --filter @airremote/backend add @fastify/websocket@^11.3.4 && pnpm --filter @airremote/backend add -D ws@^8.22.0 @types/ws@^8.18.2`
Then add the ESLint block. Verify with a scratch import of `ws` in `backend/src/shared/device-connections.ts`: `pnpm lint` → error `Only plugins/device-gateway.ts touches sockets.`; remove the scratch import.

- [ ] **Step 2: Write the certificate global setup and `useDeviceServer`**, then the failing e2e tests.

`device-handshake.e2e.ts` (`allowDevice('AA:BB:CC:DD:EE:01')` in `beforeEach`):
- `connects an allowed device over mTLS with the airremote.v1 subprotocol` — `socket.protocol === 'airremote.v1'`.
- `connects when the certificate's MAC differs in case from the stored one` (`allowedLowerCase`).
- `fails the TLS handshake without a client certificate` — `connect(null)` rejects, not with `UpgradeRejectedError`.
- `fails the TLS handshake for a certificate from another CA` (`foreignCa`).
- `rejects a certificate whose MAC has no devices row with 403` (`unknown`).
- `rejects a common name that is not a MAC with 403` (`notAMac`).
- `rejects a certificate with two common names with 403` (`twoCommonNames`).
- `rejects a missing or different subprotocol with 400` — `protocol: null` and `protocol: 'airremote.v2'`.
- `answers 404 in the error envelope for any other path` — `https.request` to `/nope` with the allowed client cert → `404`, body `{ error: { code: 'NOT_FOUND', ... } }`.
- `rejects with 403 when the allowlist check fails` — build a separate server with `service: { authorizeConnection: async () => { throw new Error('db down') } }` → `403`.

`device-messages.e2e.ts`:
- `answers a binary frame with UNSUPPORTED_FRAME`, `answers invalid JSON with INVALID_JSON`, `answers a message that fails the schema with INVALID_MESSAGE` — read the next `message` event and parse it.
- `accepts a device error report without replying` — send a valid `error`; then send invalid JSON and assert the **first** reply received is the `INVALID_JSON` one.
- `closes with 1008 after 5 bad frames in a row`.
- `closes with 1009 when a frame is over 16 KiB` — send `'x'.repeat(16 * 1024 + 1)`.
- `accepts new connections after closing an oversized frame` (Review Focus 1).

`device-connections.e2e.ts`:
- `closes the older socket with 4000 when the same device connects again` — first socket's `close` code `4000`; second still open.
- `drops a client that stops answering pings` — `useDeviceServer({ heartbeatIntervalMs: 100 })`, `autoPong: false` → `close` within 1 s.
- `keeps a client that answers pings` — default `autoPong` → still `OPEN` after 500 ms.
- `closes device sockets with 1001 on shutdown` — a second server built in the test, `server.close()` → client `close` code `1001`.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm test:e2e`
Expected: the new device files FAIL (`buildDeviceServer` missing); existing e2e files PASS.

- [ ] **Step 4: Implement** `config/logger.ts` (and use it in `app.ts`), `device-gateway.ts`, `device-server.ts`.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm test:e2e && pnpm test:unit && pnpm lint && pnpm typecheck`
Expected: all PASS, lint and typecheck clean.

- [ ] **Step 6: Commit** — "Add the device server with mTLS and the WebSocket gateway".

---

### Task 7: Start both servers, Docker and docs

**Files:**
- Modify: `backend/src/plugins/db.ts` (option `close: boolean`)
- Modify: `backend/src/app.ts` (a given `db` is owned by the caller)
- Create: `backend/src/__tests__/app.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `docker-compose.yml`, `backend/Dockerfile` (`EXPOSE 3000 8443`)
- Create: `certs/.gitkeep`; Modify: `.gitignore` (`certs/*`, `!certs/.gitkeep`)
- Modify: `CLAUDE.md`, `backend/README.md`

**Interfaces:**
- Consumes: `loadDeviceTls` (Task 2), `createDeviceConnections` (Task 3), `buildDeviceServer` (Task 6).
- Produces: `dbPlugin` options `{ handle: DbHandle; close: boolean }`; `BuildAppOptions.db` doc: "A handle the caller owns and closes. When omitted, the app creates one from `DATABASE_URL` and closes it on shutdown."

- [ ] **Step 1: Write the failing test** — `app.test.ts`: `does not close a database handle it was given` — `fakeDb` with a `close` spy; `buildApp({ env: testEnv, db })`, `app.close()` → spy not called.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project unit backend/src/__tests__/app.test.ts`
Expected: FAIL — `close` called once.

- [ ] **Step 3: Implement** the `dbPlugin`/`buildApp` change (`close: !db`), then `server.ts`:
  1. `readEnv()`; `loadDeviceTls(env)` — `ConfigError` → print, exit 1.
  2. `db = createDb(env.DATABASE_URL)`; `connections = createDeviceConnections()`.
  3. `app = buildApp({ env, db })`; `deviceServer = tls ? buildDeviceServer({ env, tls, db, connections }) : null`; when null, `app.log.warn('Device server is off: set DEVICE_TLS_CERT_FILE, DEVICE_TLS_KEY_FILE and DEVICE_TLS_CA_FILE to enable it')`.
  4. `shutdown()` = close both servers (`Promise.allSettled`), then `db.close()`. SIGINT/SIGTERM → `shutdown()`, exit 0.
  5. Listen: API on `HOST:PORT`, device server on `HOST:DEVICE_PORT`. Either failing → log, `shutdown()`, exit 1.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build && pnpm exec prettier --check .`
Expected: all PASS.

- [ ] **Step 5: Docker** — in `docker-compose.yml`'s `api` service add:

```yaml
      DEVICE_PORT: 8443
      DEVICE_TLS_CERT_FILE: ${DEVICE_TLS_CERT_FILE:+/certs/device-server.crt}
      DEVICE_TLS_KEY_FILE: ${DEVICE_TLS_KEY_FILE:+/certs/device-server.key}
      DEVICE_TLS_CA_FILE: ${DEVICE_TLS_CA_FILE:+/certs/device-ca.crt}
    volumes:
      - ./certs:/certs:ro,z
```

and the port `'${DEVICE_PORT:-8443}:8443'`. `Dockerfile`: `EXPOSE 3000 8443`.

- [ ] **Step 6: Docs**
  - `CLAUDE.md` — under Backend conventions: `<feature>.socket.ts` holds a feature's device message handlers, thin like routes; only `plugins/device-gateway.ts` imports `ws`/`@fastify/websocket` (ESLint enforces it); outgoing device messages go through `DeviceConnections.send`. Under Contracts: device messages live in `device-protocol/`, add a member to `deviceMessageSchema`/`serverMessageSchema` before using it. Under Testing: device e2e tests use `useDeviceServer()`; certificates are generated per run.
  - `backend/README.md` — a "Device listener" section: what it is, the four variables, that it stays off until all three files are set, the fixed file names in `certs/` for Compose, the key readable by uid 1000, `DEVICE_PORT` published.

- [ ] **Step 7: Manual verification** (certificates generated in the scratchpad with the same `openssl` steps as the e2e setup; nothing written to `certs/` is committed)
  - `docker compose up --build` with blank `DEVICE_TLS_*` → `api` healthy, log contains `Device server is off`.
  - With the three files in `certs/` and the variables set → an allowed device (row inserted with `psql`) connects to `wss://localhost:8443/ws` from a `node` one-liner using `ws`; an unknown one gets `403`. Remove the inserted rows and the files afterwards.
  - On the host: occupy `DEVICE_PORT` (`node -e "require('net').createServer().listen(8443)"`), start the built server with certificates set → exits 1, nothing left listening on `PORT` (Review Focus 5).

- [ ] **Step 8: Commit** — "Start the device server alongside the API".
