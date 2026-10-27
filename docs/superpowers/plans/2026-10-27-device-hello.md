# Device hello Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Devices report their firmware version in a `hello` message, and the
backend stores it on the device's row.

**Architecture:** A new `hello` member of `deviceMessageSchema`, a nullable
`devices.firmware_version` column, and a `hello` handler in
`features/devices/devices.socket.ts`. The device server combines that handler
with the device-command handlers. The simulator sends `hello` whenever its
socket opens.

**Tech Stack:** TypeScript, Zod, Drizzle (Postgres), Fastify, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-device-hello-design.md`

## Global Constraints

- Follow `CLAUDE.md`'s backend conventions:
  - only `*.repository.ts` imports `drizzle-orm`;
  - socket handlers are thin;
  - dependencies come in through `create*` factories;
  - tests go in `__tests__/`, with names `*.test.ts`, `*.itest.ts`, `*.e2e.ts`.
- `firmwareVersion`: `/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/`, at most 31
  characters, with the regex message "must look like 1.2.3 or 1.2.3-beta.1".
- `hello` carries no `commandId` and gets no reply. It is optional, never
  enforced, and never touches `device_commands`. A later `hello` replaces the
  stored version.
- The subprotocol stays `airremote.v1`. `deviceResponseSchema` and every API
  response stay unchanged.
- The migration is generated (`pnpm db:generate --name device_firmware_version`),
  never hand-written. There is no backfill.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Done means `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass.

## Review Focus

1. **A `hello` for a device deleted while it was connected** must not throw
   or crash the session. `setFirmwareVersion` on an unknown id is a no-op
   (Task 1 test).
2. **A `hello` must not leak into the API.** `GET /devices` still returns only
   `id`, `macAddress`, `name` (Task 2 e2e checks the response after a hello).
3. **An invalid `hello`** (bad version, extra key) gets `INVALID_MESSAGE` and
   writes nothing (Task 2 e2e).
4. **Two `hello`s in one connection:** the second replaces the first
   (Task 1 integration, Task 2 e2e).
5. **The simulator's `hello` after a reconnect:** sent again on each new
   socket, not only the first one (Task 3 test).

---

### Task 1: The column and storing the version

**Files:**
- Modify: `packages/db/src/schema/devices.ts`
- Create: `packages/db/migrations/0006_device_firmware_version.sql` and its
  `meta/` snapshot (generated)
- Modify: `backend/src/features/devices/devices.repository.ts`,
  `backend/src/features/devices/devices.service.ts`,
  `backend/e2e/support/device-server.ts` (`fakeDevicesService`)
- Test: `backend/src/features/devices/__tests__/devices.repository.itest.ts`,
  `backend/src/features/devices/__tests__/devices.service.test.ts`

**Interfaces:**
- Produces:
  - `devices.firmwareVersion: text('firmware_version')`, nullable, so
    `Device['firmwareVersion']` is `string | null`;
  - `DevicesRepository.setFirmwareVersion(deviceId: string, firmwareVersion: string): Promise<void>`;
  - `DevicesService.recordFirmwareVersion(deviceId: string, firmwareVersion: string): Promise<void>`.

- [ ] **Step 1: Write the failing repository tests** in `devices.repository.itest.ts`

  Add `describe('devices repository: setFirmwareVersion', …)`, reusing the
  file's `beforeEach` device:

  ```ts
  it('stores the version, and a later one replaces it', async () => {
    await repository.setFirmwareVersion(deviceId, '0.1.0');
    await repository.setFirmwareVersion(deviceId, '0.2.0-beta.1');
    const [row] = await testDb.db.select().from(devices).where(eq(devices.id, deviceId));
    expect(row!.firmwareVersion).toBe('0.2.0-beta.1');
  });
  it('leaves other devices alone', …)        // a second device keeps null
  it('does nothing for an unknown device', …) // random uuid: resolves, no rows change
  ```
  Also assert that a newly enrolled device has `firmwareVersion: null`.

- [ ] **Step 2: Run them to see them fail**

  Run: `pnpm test:integration backend/src/features/devices/__tests__/devices.repository.itest.ts`
  Expected: FAIL. `setFirmwareVersion` is not a function, or a type error on
  `firmwareVersion`.

- [ ] **Step 3: Add the column and generate the migration**

  Add `firmwareVersion: text('firmware_version')` to `devices`, then run
  `pnpm db:generate --name device_firmware_version`.
  Expected: one new migration that only says
  `ALTER TABLE "devices" ADD COLUMN "firmware_version" text;`.

- [ ] **Step 4: Implement `setFirmwareVersion`** as an
  `update(devices).set({ firmwareVersion }).where(eq(devices.id, deviceId))`,
  with a doc comment: "A device deleted in the meantime is a no-op".

- [ ] **Step 5: Run the repository tests**

  Run: the Step 2 command. Expected: PASS.

- [ ] **Step 6: Write the failing service test** in `devices.service.test.ts`

  `recordFirmwareVersion('device-1', '0.1.0')` calls the fake repository's
  `setFirmwareVersion` exactly once with `('device-1', '0.1.0')`.
  Run `pnpm test:unit backend/src/features/devices/__tests__/devices.service.test.ts`.
  Expected: FAIL.

- [ ] **Step 7: Implement `recordFirmwareVersion`**

  Put it on the `DevicesService` type with a doc comment ("What the device
  said it runs, from its `hello`"). Add
  `recordFirmwareVersion: unexpected('recordFirmwareVersion')` to
  `fakeDevicesService`. Then fix every fake that `pnpm typecheck` flags (a
  `Device` row needs `firmwareVersion: null`; a full `DevicesService` fake
  needs the method).

- [ ] **Step 8: Run the tests and typecheck**

  Run: the Step 6 command, then `pnpm typecheck`. Expected: both PASS.

- [ ] **Step 9: Commit**

  ```bash
  git add packages/db backend
  git commit -m "Store a device's firmware version"
  ```

### Task 2: The `hello` message, end to end

**Files:**
- Modify: `packages/contracts/src/device-protocol/device-protocol.contract.ts`
- Create: `backend/src/features/devices/devices.socket.ts`
- Modify: `backend/src/features/device-commands/device-commands.socket.ts`
  (narrow its return type), `backend/src/device-server.ts`
- Test: `packages/contracts/src/device-protocol/__tests__/device-protocol.contract.test.ts`,
  `backend/src/features/devices/__tests__/devices.socket.test.ts`,
  `backend/src/plugins/__tests__/device-session.test.ts` (its `{ type: 'hello' }`
  example), `backend/e2e/device-messages.e2e.ts` (same), new
  `backend/e2e/device-hello.e2e.ts`

**Interfaces:**
- Consumes: `DevicesService.recordFirmwareVersion` (Task 1).
- Produces:
  - `firmwareVersionSchema` (exported from `@airremote/contracts`);
  - the `deviceMessageSchema` member
    `{ type: 'hello'; firmwareVersion: string }`;
  - `createDevicesSocketHandlers({ service }: { service: DevicesService }): Pick<DeviceMessageHandlers, 'hello'>`;
  - `createDeviceCommandsSocketHandlers` now returns
    `Pick<DeviceMessageHandlers, 'readIrResult' | 'sendIrResult' | 'error'>`.

- [ ] **Step 1: Write the failing contract tests**

  In the existing contract test file, a `describe('hello')`:
  - `0.1.0`, `10.20.30` and `1.0.0-beta.1` parse;
  - `1.0`, `v1.0.0`, `1.0.0+build`, a 32-character version (`'1.0.0-' + 'a'.repeat(26)`),
    an extra key, and a missing `firmwareVersion` all fail.

  Run: `pnpm test:unit packages/contracts`. Expected: FAIL (the valid ones
  are rejected).

- [ ] **Step 2: Add `firmwareVersionSchema` and the `hello` member**

  Place it first in `deviceMessageSchema`, with the doc comment "Sent once
  after connecting: what the device is running. Not a command; no reply."
  Run the Step 1 command. Expected: PASS.

- [ ] **Step 3: Repoint the two "unknown type" examples**

  In `device-session.test.ts:105` and `device-messages.e2e.ts:42`, replace
  `{ type: 'hello' }` with `{ type: 'notAMessage' }`, so they keep testing an
  unknown type.

- [ ] **Step 4: Write the failing socket handler test** `devices.socket.test.ts`

  In the style of `device-commands.socket.test.ts`:

  ```ts
  it('records the version and logs it', async () => {
    await handlers().hello({ type: 'hello', firmwareVersion: '0.1.0' }, ctx());
    expect(service.recordFirmwareVersion).toHaveBeenCalledExactlyOnceWith('device-1', '0.1.0');
    expect(log.info).toHaveBeenCalledExactlyOnceWith({ firmwareVersion: '0.1.0' }, 'Device said hello');
  });
  ```
  Run: `pnpm test:unit backend/src/features/devices`. Expected: FAIL (no
  module).

- [ ] **Step 5: Implement `devices.socket.ts` and wire it**

  The handler calls the service, then logs. In `device-server.ts`, pass
  `handlers: { ...createDevicesSocketHandlers({ service: devices }), ...createDeviceCommandsSocketHandlers({ service: deviceCommands }) }`,
  and narrow `createDeviceCommandsSocketHandlers`' return type as in
  Interfaces. The spread must still satisfy `DeviceMessageHandlers`, so a
  missing type keeps failing to compile.
  Run: the Step 4 command and `pnpm typecheck`. Expected: PASS.

- [ ] **Step 6: Write the e2e tests** `backend/e2e/device-hello.e2e.ts`

  Use `useDeviceServer({ api: true })` and `allowDevice('AA:BB:CC:DD:EE:01')`,
  with a helper that polls the row's `firmware_version` (every 25 ms, giving
  up after 2 s), since `hello` gets no reply:
  - `stores the version a device says hello with`: send
    `{ type: 'hello', firmwareVersion: '0.1.0' }`, then poll until it is
    `'0.1.0'`;
  - `a later hello replaces it`: send `0.1.0`, then `0.2.0`, then poll until
    `'0.2.0'`;
  - `answers an invalid version with INVALID_MESSAGE and stores nothing`:
    send `firmwareVersion: 'v1'`, then `nextMessage` is
    `{ type: 'error', code: 'INVALID_MESSAGE' }` (`toMatchObject`), and the
    row is still null;
  - `does not show the version in the devices list`: after a hello is stored,
    `GET /devices` as the owner returns objects with exactly the keys `id`,
    `macAddress`, `name`. Sign-in and enrollment work as in
    `backend/e2e/devices.e2e.ts` or `learn-buttons.e2e.ts`; reuse their
    helpers.

  Run: `pnpm test:e2e backend/e2e/device-hello.e2e.ts backend/e2e/device-messages.e2e.ts`.
  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/contracts backend
  git commit -m "Let devices say hello with their firmware version"
  ```

### Task 3: The simulator says hello

**Files:**
- Modify: `tools/device-sim/src/args.ts`, `tools/device-sim/src/device.ts`,
  `tools/device-sim/src/main.ts`, `tools/device-sim/src/terminal.ts`
  (`/status`), `tools/device-sim/README.md`
- Test: `tools/device-sim/src/__tests__/args.test.ts`,
  `tools/device-sim/src/__tests__/device.test.ts`,
  `tools/device-sim/src/__tests__/terminal.test.ts`

**Interfaces:**
- Consumes: `firmwareVersionSchema`, and the `hello` member (Task 2).
- Produces:
  - `CliOptions.firmwareVersion: string`;
  - `createDevice({ …, firmwareVersion: string })`;
  - `DeviceStatus.firmwareVersion: string`.

- [ ] **Step 1: Write the failing tests**

  - `args.test.ts`:
    - no flag gives `firmwareVersion: '0.0.0-sim'`;
    - `--firmware-version 1.2.3` gives `'1.2.3'`;
    - `--firmware-version v1` is `{ ok: false }` with a message containing
      `--firmware-version` and the usage.
  - `device.test.ts`:
    - after a successful connect, the first `sent` event and the first frame
      on the fake socket are
      `{"type":"hello","firmwareVersion":"<the option>"}`;
    - after the server closes the socket and the device reconnects, the new
      socket's first frame is `hello` again;
    - an enroll attempt that is accepted (the socket opens) also sends it.
  - `terminal.test.ts`: `/status` shows the version in a `firmware` row.

  Run: `pnpm test:unit tools/device-sim`. Expected: FAIL.

- [ ] **Step 2: Implement**

  - `args.ts`: `'firmware-version': { type: 'string', default: '0.0.0-sim' }`,
    validated with `firmwareVersionSchema`, and added to `USAGE`.
  - `device.ts`: take `firmwareVersion` in `createDevice`, and in `open()`,
    right after `current = socket = result.socket`, call
    `sendMessage({ type: 'hello', firmwareVersion })`. Include it in
    `status()`.
  - `main.ts`: pass `options.firmwareVersion` through.
  - `terminal.ts`: show it as `firmware` in the status table.

  Run: the Step 1 command. Expected: PASS.

- [ ] **Step 3: Update the README**

  Add `--firmware-version` (default `0.0.0-sim`) to the options line, and one
  sentence: the simulator says hello with that version every time it
  connects. Also add the `firmware` row to `/status`'s description.

- [ ] **Step 4: Run everything**

  Run: `pnpm lint && pnpm typecheck && pnpm test`
  Expected: all pass.

- [ ] **Step 5: Commit**

  ```bash
  git add tools/device-sim
  git commit -m "Make the device simulator say hello with its firmware version"
  ```
