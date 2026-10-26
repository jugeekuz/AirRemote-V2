# Pressing Buttons and Listing Devices, Remotes and Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users list their devices, remotes and a remote's buttons, and press a button: `POST /buttons/:buttonId/press` answers `202` with a `send_ir` device command, the device replays the code and confirms, and the UI polls `GET /device-commands/:id`.

**Architecture:** Pressing reuses learning's machinery: a `device_commands` row of a new kind `send_ir`, sent as `sendIr` over the in-process `DeviceConnections`, settled in Postgres by the device server when `sendIrResult` or an `error` arrives, read by the existing poll. The three lists are plain owned-by-user queries.

**Tech Stack:** Fastify 5, Zod 4, Drizzle 0.45 + Postgres 18, `ws`, Vitest, `tools/device-sim`.

**Spec:** `docs/superpowers/specs/2026-10-26-press-buttons-design.md`

## Global Constraints

- Follow `CLAUDE.md` (layers, `create*` factories, contracts as route schemas, `onRequest: app.authenticate`, only repositories import `drizzle-orm`; `shared/pg-errors.ts` only from repositories).
- Branch `feature/press-buttons`.
- Endpoints (exact): `GET /devices` → `200 [{ id, macAddress, name }]`; `GET /remotes` → `200 [{ id, deviceId, name, type }]`; `GET /remotes/:remoteId/buttons` → `200 [{ id, remoteId, name }]` (`404 NOT_FOUND` if not the user's); `POST /buttons/:buttonId/press` (no body) → `202` + `Location: /device-commands/<id>` + the command, or `404 NOT_FOUND`, `409 DEVICE_OFFLINE`, `409 DEVICE_BUSY`.
- Lists ordered by `lower(name)`, then `id`; only the signed-in user's rows; no timings anywhere in a response.
- Protocol (exact): server → device `sendIr { commandId, timingsUs }` (`timingsUs` = `irTimingsSchema`); device → server `sendIrResult { commandId }`; new device error code `SEND_FAILED`.
- Device command kind `send_ir`, `context { buttonId }`; a press expires **5_000** ms after creation (Postgres `now()`); the option is `sendTtlMs` on `DeviceCommandTimings`.
- Poll: a succeeded `send_ir` has no `button`; stored `SEND_FAILED` → API code `IR_SEND_FAILED` (new in `errorCodeSchema`); all other mappings unchanged.
- One pending command per device (existing index): a press during a learn or another press → `409 DEVICE_BUSY`.
- Simulator: on `sendIr` logs `sending an IR code (N timings)`, answers `sendIrResult` after ~100 ms; `/send-fails on|off` makes it answer `error SEND_FAILED`; a `sendIr` while a read is listening → `error BUSY`; `/status` shows whether sends fail.
- Commit messages: plain imperative sentence, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line. Before each commit: `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --check .` each clean, run on their own; `pnpm test` once (`--maxWorkers=2` if e2e times out under load).

## Review Focus

1. **Another user's button pressed by id** → `404`, and nothing is created or sent. → Task 3 service unit test and Task 4 e2e.
2. **A `sendIrResult` answering a `learn_button` command (or a `readIrResult` answering a `send_ir`)** changes nothing — settling matches the kind. → Task 3 repository itest "does not complete a command of another kind".
3. **A press while a learn is pending on the same device** → `409 DEVICE_BUSY` at once; the learn is untouched. → Task 4 e2e.
4. **The longest stored code (2048 × 65535) sent as `sendIr`** fits the 16 KiB frame and reaches the device intact. → Task 1 contract test and Task 4 e2e "sends exactly the button's timings".
5. **Lists leak nothing:** another user's devices, remotes and buttons never appear, and an empty account gets `[]`. → Task 2 repository itests.

---

### Task 1: Protocol, contracts and the `send_ir` kind

**Files:**
- Modify: `packages/contracts/src/device-protocol/device-protocol.contract.ts` (+ test), `packages/contracts/src/device-commands/device-commands.contract.ts` (+ test), `packages/contracts/src/errors/errors.contract.ts`, `packages/contracts/src/devices/devices.contract.ts`, `remotes/remotes.contract.ts`, `buttons/buttons.contract.ts` (+ tests)
- Modify: `packages/db/src/schema/device-commands.ts`; Create: generated migration (`pnpm db:generate --name device_command_send_ir`); test in `packages/db/src/schema/__tests__/device-commands.itest.ts`

**Interfaces — Produces:**
- `serverMessageSchema` gains `strictObject({ type: literal('sendIr'), commandId, timingsUs: irTimingsSchema })`; `deviceMessageSchema` gains `strictObject({ type: literal('sendIrResult'), commandId })`; `deviceErrorCodeSchema` gains `'SEND_FAILED'`.
- `DEVICE_COMMAND_KINDS = ['learn_button', 'send_ir']`; `errorCodeSchema` gains `'IR_SEND_FAILED'`.
- `deviceListResponseSchema = z.array(deviceResponseSchema)`, `remoteListResponseSchema = z.array(remoteResponseSchema)`, `buttonListResponseSchema = z.array(buttonResponseSchema)`.
- `type SendIrContext = { buttonId: string }`; `deviceCommands.context` typed `LearnButtonContext | SendIrContext`.

- [ ] **Step 1: Write the failing tests:** `sendIr` and `sendIrResult` accepted, unknown keys and a missing `commandId` rejected; `SEND_FAILED` in `deviceErrorCodeSchema.options`; `JSON.stringify` of the largest `sendIr` (uuid, 2048 × 65535) is under 16 × 1024 bytes; `send_ir` accepted by `deviceCommandKindSchema`; `IR_SEND_FAILED` in `errorCodeSchema.options`; the three list schemas accept `[]` and a valid item; itest: a `send_ir` row with `context { buttonId }` can be inserted.
- [ ] **Step 2: Run** `pnpm vitest run --project unit packages/contracts` and `pnpm vitest run --project integration packages/db` — Expected: FAIL.
- [ ] **Step 3: Implement**; generate the migration (it should only add the enum value); `pnpm db:generate` again → "No schema changes". The device-commands socket handlers must still compile: add a `sendIrResult` handler stub only if `DeviceMessageHandlers` demands one now — Task 3 fills it (if a stub is needed, make it log at warn "not handled yet" and ledger it).
- [ ] **Step 4: Run** the Step 2 commands, then `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the IR send messages and the send_ir command kind"`.

---

### Task 2: The three lists

**Files:**
- Modify: `backend/src/features/devices/devices.{repository,service,routes}.ts`, `features/remotes/remotes.{repository,service,routes}.ts`, `features/buttons/buttons.{repository,service,routes}.ts` (+ their tests: repository itests, service and route unit tests)

**Interfaces — Produces:**
- `DevicesRepository.listForUser(userId): Promise<Device[]>`; `DevicesService.list(userId): Promise<DeviceResponse[]>`; `GET /devices` (`GET /` in `devicesRoutes`).
- `RemotesRepository.listForUser(userId): Promise<Remote[]>` (joined through `devices.user_id`); `RemotesService.list(userId): Promise<RemoteResponse[]>`; `GET /remotes`.
- `ButtonsRepository.listForRemote(remoteId): Promise<{ id; remoteId; name }[]>` (no timings selected); `ButtonsService.list(userId, remoteId): Promise<ButtonResponse[]>` (`findOwnedRemote` first → `404 NOT_FOUND`); `GET /remotes/:remoteId/buttons`.
- All ordered `lower(name), id`.

- [ ] **Step 1: Write the failing tests:** repository itests — each list returns only the user's rows (seed two users), ordered `lower(name)` then id (`b`, `A`, `c` → `A`, `b`, `c`), `[]` for an empty account; `listForRemote` returns no `timingsUs`; service units — `list` maps to the response shape, buttons `list` throws `404` for a remote not owned and never calls `listForRemote`; route units — `401` without a token, `200` with the list, non-UUID `remoteId` → `400`.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/features` and `pnpm vitest run --project integration backend/src/features` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Step 2 commands — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "List devices, remotes and buttons"`.

---

### Task 3: Pressing a button

**Files:**
- Modify: `backend/src/features/device-commands/device-commands.{repository,service,socket}.ts` (+ tests), `features/buttons/buttons.{repository,service,routes}.ts` (+ tests), `backend/src/app.ts` (timings)

**Interfaces — Produces:**
- `DeviceCommandsRepository.completeSendIr({ id, deviceId }): Promise<boolean>` — marks `succeeded` (with `finished_at`) only a live pending row of that device **and kind `send_ir`**; `completeLearnButton` likewise only matches kind `learn_button` (already does — keep a test).
- `DeviceCommandTimings` gains `sendTtlMs` (default `5_000`).
- `DeviceCommandsService.startSendIr({ deviceId, buttonId, timingsUs }): Promise<DeviceCommandResponse>` — same steps as `startLearnButton` (offline `409`, busy `409`, lost-before-send fails `DEVICE_OFFLINE` and `409`, record connection), sending `{ type: 'sendIr', commandId, timingsUs }` and creating with `kind: 'send_ir'`, `context { buttonId }`, `ttlMs: sendTtlMs`.
- `DeviceCommandsService.settleSendResult(deviceId, commandId): Promise<boolean>`; socket handler `sendIrResult` → it, logging `info({ commandId, outcome })`, an unmatched reply at warn.
- Poll mapping: `SEND_FAILED` → `IR_SEND_FAILED` with a plain-sentence message; no `button` for `send_ir`.
- `ButtonsRepository.findOwnedButton(buttonId, userId): Promise<{ id; remoteId; deviceId; timingsUs } | null>`; `ButtonsService.press(userId, buttonId): Promise<DeviceCommandResponse>` — `404 NOT_FOUND`, then `startSendIr`; `POST /buttons/:buttonId/press` (`202`, `Location`), registered in `app.ts` at prefix `/buttons`.

- [ ] **Step 1: Write the failing tests:** repository itests — `completeSendIr` succeeds once for the right device; `false` for another device, an unknown id, an expired row, and a `learn_button` command ("does not complete a command of another kind"); `completeLearnButton` returns `not-pending` for a `send_ir` row; `findOwnedButton` returns the timings for the owner and `null` for another user. Service units — `press` 404 never calls `startSendIr`; `startSendIr` offline, busy, lost-before-send, success (sent message exact, connection recorded, `sendTtlMs` passed); `settleSendResult` passes through; poll mapping for `SEND_FAILED` and a succeeded `send_ir` without `button`; socket handler logs. Route units — `202` + `Location`, `401`, non-UUID → `400`.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/features` and `pnpm vitest run --project integration backend/src/features` — Expected: FAIL.
- [ ] **Step 3: Implement**; thread `sendTtlMs` through `buildApp`'s `deviceCommandTimings` like the other timings.
- [ ] **Step 4: Run** the Step 2 commands, then `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Press a button: send its IR code and settle the device's answer"`.

---

### Task 4: End to end

**Files:**
- Create: `backend/e2e/press-buttons.e2e.ts` (reuse helpers from `backend/e2e/learn-buttons.e2e.ts` / `support/device-server.ts`; move shared helpers into `support/` rather than copying them)

- [ ] **Step 1: Write the e2e tests** (`useDeviceServer({ api: true, deviceCommandTimings: { readTimeoutMs: 1000, ttlMs: 2000, sendTtlMs: 1500 } })`; a button created through a real learn, or inserted directly with known timings):
  - lists: `GET /devices`, `GET /remotes`, `GET /remotes/:id/buttons` return the user's rows in order and not another user's; another user's remote → `404`;
  - "sends exactly the button's timings": press → `202` + `Location`; the device receives `sendIr` with that `commandId` and the stored `timingsUs` (use a 2048-entry code); it answers `sendIrResult`; the poll reaches `succeeded` with no `button`;
  - the device answers `error SEND_FAILED` → `failed`, `IR_SEND_FAILED`;
  - silent device → `expired`, `DEVICE_NOT_RESPONDING` after the short `sendTtlMs`;
  - offline → `409 DEVICE_OFFLINE`; a press while a learn is pending → `409 DEVICE_BUSY` and the learn still succeeds afterwards; another user's button → `404`.
- [ ] **Step 2: Run** `pnpm vitest run --project e2e backend/e2e/press-buttons.e2e.ts` — Expected: PASS. Mutation check: make `completeSendIr` ignore `kind` and add an e2e/itest proving the cross-kind case fails — or confirm the Task 3 itest fails under that mutation; restore.
- [ ] **Step 3: Commit** — `git commit -m "Test pressing buttons end to end"`.

---

### Task 5: The simulator sends; docs; manual run

**Files:**
- Modify: `tools/device-sim/src/{device,commands,terminal,main}.ts` (+ tests), `tools/device-sim/README.md`, `backend/README.md`

**Interfaces — Produces:**
- Device: on `sendIr` → `· sending an IR code (N timings)`; after `SEND_DELAY_MS = 100` (clock timer) sends `sendIrResult { commandId }`, or `error { code: 'SEND_FAILED', commandId }` when `sendFails` is on; a `sendIr` while a read is listening → `error BUSY` at once; `setSendFails(on)`; `status()` gains `sendFails`; `stop()`/`disconnect()`/close clear the send timer.
- Commands: `/send-fails on|off` (else usage); `COMMAND_HELP` entry.

- [ ] **Step 1: Write the failing tests:** device (log line, confirmation after 100 ms, `SEND_FAILED` when on, `BUSY` during a read, timers cleared), commands parsing, status rendering.
- [ ] **Step 2: Run** `pnpm vitest run --project unit tools` — Expected: FAIL.
- [ ] **Step 3: Implement**; README: list endpoints and pressing with curl (every variable set by an earlier command, bodies matching the contracts), `/send-fails`; `backend/README.md`: the four new endpoints.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Manual run** against an isolated backend (throwaway Postgres on its own port, backend on its own ports, scratch certificates; never the owner's `airremote-v2-db-1`, `.env` or `certs/`; clean up by PID): enroll, create a remote, learn with `/press`, list all three, press → `succeeded`, `/send-fails on` and press → `failed IR_SEND_FAILED`. Record results.
- [ ] **Step 6: Run** `pnpm lint`, `pnpm typecheck`, `pnpm exec prettier --check .`, `pnpm test`, `pnpm build` — Expected: clean.
- [ ] **Step 7: Commit** — `git commit -m "Let the simulator send IR codes, and document pressing buttons"`.
