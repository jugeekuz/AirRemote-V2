# Creating Remotes and Learning Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users create remotes on their devices and learn buttons asynchronously: `POST /remotes/:remoteId/buttons` answers `202` with a device command, the device's reply settles that command in Postgres (saving the button), and the frontend polls `GET /device-commands/:id`.

**Architecture:** A `device_commands` table holds every command from creation to `succeeded`/`failed`/`expired`; expiry is computed from `expires_at` with the database clock. The API checks, creates the command and sends `readIr` through the in-process `DeviceConnections` (the only in-process piece), recording the connection id. The device server's handlers settle commands in Postgres (inserting the button in the same transaction), and a closing connection fails only the commands sent over it. Polling reads Postgres, so it works on any instance.

**Tech Stack:** Fastify 5, Zod 4, Drizzle 0.45 + Postgres 18, `ws`, Vitest (unit/integration/e2e), the device simulator (`tools/device-sim`).

**Spec:** `docs/superpowers/specs/2026-10-26-learn-button-design.md`

## Global Constraints

- Follow `CLAUDE.md` (layers, `create*` factories, contracts as route schemas, error envelope, `onRequest: app.authenticate`, only repositories import `drizzle-orm`).
- Branch `feature/learn-buttons` (stacks `feature/ir-messages` and `feature/remotes-and-buttons`).
- Endpoints (exact): `POST /devices/:deviceId/remotes` → `201 { id, deviceId, name, type }`; `POST /remotes/:remoteId/buttons` → `202` + `Location: /device-commands/<id>` + the command; `GET /device-commands/:id` → `200` the command.
- Command body (exact keys): `{ id, kind, status, createdAt, expiresAt, error?: { code, message }, button?: { id, remoteId, name } }`; `kind` `learn_button`; `status` `pending | succeeded | failed | expired`.
- New API error codes (exact): `REMOTE_NAME_TAKEN`, `BUTTON_NAME_TAKEN`, `DEVICE_OFFLINE`, `DEVICE_BUSY`, `IR_READ_TIMEOUT`, `IR_CODE_TOO_LONG`, `DEVICE_ERROR`, `DEVICE_NOT_RESPONDING`. Synchronous answers: `404 NOT_FOUND`, `409` for the four `*_TAKEN`/`DEVICE_*` codes.
- Stored `error_code` → API `error.code`: `READ_TIMEOUT`→`IR_READ_TIMEOUT`, `CAPTURE_TOO_LONG`→`IR_CODE_TOO_LONG`, `BUSY`→`DEVICE_BUSY`, `INVALID_COMMAND`/`INTERNAL`→`DEVICE_ERROR`, `DEVICE_DISCONNECTED`→`DEVICE_NOT_RESPONDING`, `DEVICE_OFFLINE`→`DEVICE_OFFLINE`, `BUTTON_NAME_TAKEN`→`BUTTON_NAME_TAKEN`; `expired` → `DEVICE_NOT_RESPONDING`.
- Timings: device reads `15_000` ms; command expires `20_000` ms after creation, computed with Postgres `now()`. Both are service options for tests.
- Names: 1–100 characters after trimming (the contract trims; the database rejects edge whitespace).
- The device protocol field is `commandId` (already on the branch).
- Commit messages: plain imperative sentence, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line. Before each commit: `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --check .` each clean, run on their own. If the machine is loaded, run e2e with `--maxWorkers=2`.

## Review Focus

1. **A late close from a replaced connection** must not fail a command sent over the device's new connection. → Task 3 itest "a connection's close fails only the commands sent over it" and Task 7 e2e "a reconnect does not fail a command sent over the new connection".
2. **A device crash or a server crash mid-command** never blocks the device past the expiry: the next learn after `expiresAt` is accepted. → Task 3 itest "creating a command expires the device's overdue pending command".
3. **Another device or a forged id:** a `readIrResult` from device B for device A's command changes nothing, and a reply with an unknown `commandId` is dropped without error. → Task 3 itests and Task 5 unit tests.
4. **Clock skew across instances:** expiry and "is it still pending" use Postgres `now()`, never the Node clock. → Task 3 itest reads a row inserted with `expires_at` in the past as `expired`.
5. **The button still saves when nobody polls**, and a name taken between the `202` and the reply ends as `failed BUTTON_NAME_TAKEN`, never a 500. → Task 3 itests and Task 7 e2e.

---

### Task 1: Contracts

**Files:**
- Modify: `packages/contracts/src/errors/errors.contract.ts` (+ its test if it lists codes); `packages/contracts/src/remotes/remotes.contract.ts`; `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/shared/names.contract.ts`, `packages/contracts/src/buttons/buttons.contract.ts`, `packages/contracts/src/device-commands/device-commands.contract.ts` (+ `__tests__` for each)

**Interfaces — Produces:**
- `nameSchema = z.string().trim().min(1).max(100)` (`names.contract.ts`).
- `createRemoteRequestSchema = z.object({ name: nameSchema, type: remoteTypeSchema })`; `remoteResponseSchema = z.object({ id: z.uuid(), deviceId: z.uuid(), name: z.string(), type: remoteTypeSchema })`; types `CreateRemoteRequest`, `RemoteResponse`.
- `learnButtonRequestSchema = z.object({ name: nameSchema })`; `buttonResponseSchema = z.object({ id: z.uuid(), remoteId: z.uuid(), name: z.string() })`; types.
- `DEVICE_COMMAND_KINDS = ['learn_button'] as const`, `DEVICE_COMMAND_STATUSES = ['pending','succeeded','failed','expired'] as const`, their `z.enum` schemas; `deviceCommandResponseSchema = z.object({ id: z.uuid(), kind, status, createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), error: z.object({ code: errorCodeSchema, message: z.string() }).optional(), button: buttonResponseSchema.optional() })`; type `DeviceCommandResponse`.
- The eight new codes in `errorCodeSchema`.

- [ ] **Step 1: Write the failing tests:** `nameSchema` trims `'  Power '` → `'Power'`, trims `' Power'`, rejects `''`, `'   '`, 101 chars; both request schemas accept a valid body and reject a bad `type` / missing `name`; `deviceCommandResponseSchema` accepts a pending command, a succeeded one with `button`, a failed one with `error`, and rejects status `'done'`; `errorCodeSchema.options` contains the eight codes.
- [ ] **Step 2: Run** `pnpm vitest run --project unit packages/contracts` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** and re-export.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the contracts for remotes, button learning and device commands"`.

---

### Task 2: The `device_commands` table

**Files:**
- Create: `packages/db/src/schema/device-commands.ts`; Modify: `packages/db/src/schema/index.ts`
- Create: generated `packages/db/migrations/0004_device_commands.sql` (+ snapshot, journal)
- Create: `packages/db/src/schema/__tests__/device-commands.itest.ts`

**Interfaces — Produces:**
- `deviceCommandKind = pgEnum('device_command_kind', DEVICE_COMMAND_KINDS)`, `deviceCommandStatus = pgEnum('device_command_status', DEVICE_COMMAND_STATUSES)`.
- `deviceCommands = pgTable('device_commands', { id: uuid().primaryKey().defaultRandom(), deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }), kind: deviceCommandKind().notNull(), context: jsonb().$type<LearnButtonContext>().notNull(), status: deviceCommandStatus().notNull().default('pending'), errorCode: text('error_code'), resultId: uuid('result_id'), connectionId: uuid('connection_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), finishedAt: timestamp('finished_at', { withTimezone: true }) })`.
- `type LearnButtonContext = { remoteId: string; name: string }`; types `DeviceCommand`, `NewDeviceCommand`.
- Index `device_commands_one_pending_per_device` — unique on `device_id` `WHERE status = 'pending'`; index `device_commands_connection_id_idx` on `connection_id` `WHERE status = 'pending'`.
- Check `device_commands_finished_check`: `(status = 'pending') = (finished_at IS NULL)`; check `device_commands_error_check`: `(status = 'failed') = (error_code IS NOT NULL)`.

- [ ] **Step 1: Write the failing itests** (seed user + device; `rejection()` helper from `./pg-errors`): a second `pending` row for the same device → `23505`, `device_commands_one_pending_per_device`; a `pending` and a `succeeded` row on one device both accepted; `pending` with `finished_at` → `device_commands_finished_check`; `failed` without `error_code` → `device_commands_error_check`; deleting the device deletes its commands.
- [ ] **Step 2: Run** `pnpm vitest run --project integration packages/db` — Expected: FAIL (`deviceCommands` not exported).
- [ ] **Step 3: Implement**; `pnpm db:generate --name device_commands`; read the SQL (no hand edits expected); `pnpm db:generate` again → "No schema changes".
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the device commands table"`.

---

### Task 3: The device commands repository

**Files:**
- Create: `backend/src/features/device-commands/device-commands.repository.ts` (+ `__tests__/device-commands.repository.itest.ts`)

**Interfaces — Produces** (`DeviceCommandsRepository`, `createDeviceCommandsRepository(db)`); every time comparison uses Postgres `now()`:
- `create(input: { deviceId: string; kind: 'learn_button'; context: LearnButtonContext; ttlMs: number }): Promise<DeviceCommand | null>` — one transaction: `UPDATE … SET status='expired', finished_at=now() WHERE device_id=$1 AND status='pending' AND expires_at <= now()`, then insert with `expires_at = now() + ttl`; a unique violation on `device_commands_one_pending_per_device` → `null` (busy).
- `recordConnection(id: string, connectionId: string): Promise<void>`.
- `fail(input: { id: string; deviceId: string; errorCode: string }): Promise<boolean>` — `WHERE id AND device_id AND status='pending' AND expires_at > now()`; sets `finished_at`.
- `completeLearnButton(input: { id: string; deviceId: string; timingsUs: number[] }): Promise<'succeeded' | 'name-taken' | 'not-pending'>` — one transaction: lock the pending, unexpired, same-device row (`SELECT … FOR UPDATE`); none → `'not-pending'`; insert the button from `context` (savepoint); unique violation on `buttons_remote_id_name_key` → mark `failed BUTTON_NAME_TAKEN`, `'name-taken'`; else mark `succeeded` with `result_id`, `'succeeded'`.
- `failConnection(input: { deviceId: string; connectionId: string; errorCode: string }): Promise<number>` — pending rows with that `connection_id` only.
- `findForUser(id: string, userId: string): Promise<DeviceCommandView | null>` — joined through `devices.user_id`; `status` is `'expired'` when stored `pending` and `expires_at <= now()`; includes the button (`id`, `remoteId`, `name`) when `result_id` is set.
- `DeviceCommandView = { id; kind; status; errorCode: string | null; createdAt: Date; expiresAt: Date; button: { id; remoteId; name } | null }`.

- [ ] **Step 1: Write the failing itests** (seed two users, a device each, a remote on the first device):
  - "creates a pending command expiring ttl after now" (compare `expiresAt - createdAt` ≈ ttl).
  - "refuses a second pending command for the device" → `null`.
  - "creating a command expires the device's overdue pending command" — insert a pending row with `expires_at = now() - 1s` directly, then `create` succeeds and the old row is `expired` with `finished_at`.
  - "reads a pending command past its expiry as expired" — raw row with past `expires_at`; `findForUser` → `expired`.
  - "completes a learn: saves the button with the timings and marks it succeeded" — `findForUser` returns the button; `buttons` row has the exact timings.
  - "a name taken meanwhile ends as failed BUTTON_NAME_TAKEN" — insert a button `power` first; `completeLearnButton` → `'name-taken'`; no new button.
  - "ignores a reply from another device, for an unknown id, or after expiry" → `'not-pending'`, row unchanged.
  - "fails a command once; a second fail changes nothing".
  - "a connection's close fails only the commands sent over it" — a pending command recorded on connection `c-new`; `failConnection(device, 'c-old')` returns `0` and leaves it pending; `failConnection(device, 'c-new')` fails it with `DEVICE_DISCONNECTED`.
  - "only the owner finds a command" — the other user gets `null`.
- [ ] **Step 2: Run** `pnpm vitest run --project integration backend/src/features/device-commands` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the device commands repository"`.

---

### Task 4: Connection ids in the registry and the close hook

**Files:**
- Modify: `backend/src/shared/device-connections.ts` (+ `shared/__tests__/device-connections.test.ts`), `backend/src/plugins/device-session.ts` (+ its test)

**Interfaces — Produces:**
- `register(deviceId, socket): string` — returns a new random connection id (UUID) for this socket.
- `send(deviceId, message): string | null` — the connection id it was sent over, or `null` when not connected (was `boolean`; callers updated).
- `onConnectionClosed(listener: (deviceId: string, connectionId: string) => void): void` — called from `unregister` for the socket's own connection id, **also** when that socket had already been replaced.
- `isConnected` unchanged.

- [ ] **Step 1: Write the failing unit tests:** ids are distinct per `register`; `send` returns the current connection's id and `null` when offline; `unregister` of a replaced socket still notifies with **its own** id and leaves the newer socket registered; a listener that throws does not break `unregister`.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/shared backend/src/plugins` — Expected: FAIL.
- [ ] **Step 3: Implement**; update existing callers and tests of `send`'s return value.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS; then `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Give each device connection an id and report its close"`.

---

### Task 5: Settling commands from device replies

**Files:**
- Create: `backend/src/features/device-commands/device-commands.service.ts` (settling half), `device-commands.socket.ts` (+ tests)
- Delete: `backend/src/features/devices/devices.socket.ts` and its test (their logging moves here)
- Modify: `backend/src/device-server.ts` (handlers from `device-commands`; subscribe `connections.onConnectionClosed` → `service.connectionClosed`, errors logged at error)

**Interfaces — Produces** (`createDeviceCommandsService({ repository, connections, readTimeoutMs = 15_000, ttlMs = 20_000 })`, settling methods):
- `settleReadResult(deviceId, commandId, timingsUs): Promise<'succeeded' | 'name-taken' | 'not-pending'>`.
- `settleError(deviceId, commandId, code: DeviceErrorCode): Promise<boolean>`.
- `connectionClosed(deviceId, connectionId): Promise<number>` → `failConnection(…, 'DEVICE_DISCONNECTED')`.
- `createDeviceCommandsSocketHandlers({ service }): DeviceMessageHandlers` — `readIrResult` → `settleReadResult`, logs `info({ commandId, entries, outcome })`, `'not-pending'` logged at warn ("unknown, late or another device's command"); `error` with `commandId` → `settleError` (a `false` result logged at warn), without → `warn({ code, deviceMessage })` as today.

- [ ] **Step 1: Write the failing unit tests** (fake repository): each handler path above, including the warn for a `'not-pending'` reply and for an error answering nothing; `connectionClosed` passes `DEVICE_DISCONNECTED`.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/features/device-commands` — Expected: FAIL.
- [ ] **Step 3: Implement**; wire into `device-server.ts`; delete `devices.socket.ts`.
- [ ] **Step 4: Run** the Step 2 command, then `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Settle device commands from the device's replies"`.

---

### Task 6: Creating remotes, learning buttons, polling

**Files:**
- Create: `backend/src/features/remotes/remotes.{routes,service,repository}.ts` (+ tests: service unit, routes unit, repository itest)
- Create: `backend/src/features/buttons/buttons.{routes,service,repository}.ts` (+ tests)
- Modify: `backend/src/features/device-commands/device-commands.service.ts` (`startLearnButton`, `get`), create `device-commands.routes.ts` (+ tests)
- Modify: `backend/src/app.ts` (`BuildAppOptions.connections?: DeviceConnections`, default a fresh registry; register the three route plugins), `backend/src/server.ts` (pass the shared registry), `backend/e2e/support/device-server.ts` (with `api: true`, share the device server's registry)

**Interfaces — Produces:**
- `RemotesRepository`: `findOwnedDevice(deviceId, userId): Promise<{ id } | null>`; `create({ deviceId, name, type }): Promise<Remote | null>` (`null` on `remotes_device_id_name_key`).
- `RemotesService.create(userId, deviceId, input: CreateRemoteRequest): Promise<RemoteResponse>` — `404 NOT_FOUND` / `409 REMOTE_NAME_TAKEN`.
- `ButtonsRepository`: `findOwnedRemote(remoteId, userId): Promise<{ id; deviceId } | null>`; `nameTaken(remoteId, name): Promise<boolean>` (case-insensitive).
- `ButtonsService.learn(userId, remoteId, input: LearnButtonRequest): Promise<DeviceCommandResponse>` — `404`, `409 BUTTON_NAME_TAKEN`, then `deviceCommands.startLearnButton({ deviceId, remoteId, name })`.
- `DeviceCommandsService.startLearnButton({ deviceId, remoteId, name }): Promise<DeviceCommandResponse>` — `!connections.isConnected` → `409 DEVICE_OFFLINE`; `repository.create` `null` → `409 DEVICE_BUSY`; `connections.send(deviceId, { type: 'readIr', commandId, timeoutMs: readTimeoutMs })` `null` → `repository.fail(…, 'DEVICE_OFFLINE')` and `409 DEVICE_OFFLINE`; else `recordConnection` and return the pending command.
- `DeviceCommandsService.get(userId, id): Promise<DeviceCommandResponse>` — `404` or the mapped view (Global Constraints table; messages: plain English per code).
- Routes: `POST /devices/:deviceId/remotes` (201), `POST /remotes/:remoteId/buttons` (202, `Location`), `GET /device-commands/:id` (200); params validated as UUIDs (a bad id → `400 VALIDATION_FAILED`); all `onRequest: app.authenticate`.

- [ ] **Step 1: Write the failing tests:** remotes and buttons services with fake repositories (every branch; the name check runs before `startLearnButton` is called); `startLearnButton` with a fake registry and repository (offline, busy, lost between check and send, success records the connection); `get`'s mapping for every stored outcome; routes with fake services (status codes, `Location`, `401` without a token, `400` for a non-UUID id); remotes and buttons repository itests (ownership through the device, case-insensitive name check, `null` on a duplicate remote name).
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/features` and `pnpm vitest run --project integration backend/src/features` — Expected: FAIL.
- [ ] **Step 3: Implement** and wire into `app.ts`, `server.ts` and the e2e helper.
- [ ] **Step 4: Run** the Step 2 commands, then `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Create remotes, learn buttons and poll device commands"`.

---

### Task 7: End to end

**Files:**
- Create: `backend/e2e/learn-buttons.e2e.ts`
- Modify: `backend/e2e/support/device-server.ts` only if a helper is needed (e.g. `answerNextRead(socket, reply)`), and `useDeviceServer` options to shorten `readTimeoutMs`/`ttlMs`

**Interfaces — Consumes:** everything above; `useDeviceServer({ api: true, … })`, `connectDevice`, `nextMessage`.

- [ ] **Step 1: Write the e2e tests** (a user signs in; `allowDevice`; the test device is a `ws` client with the `allowed` certificate that answers `readIr`):
  - create a remote (`201`); a duplicate name (`409 REMOTE_NAME_TAKEN`); another user's device (`404`).
  - learn: `202` with `Location`; the device receives `readIr` with that `commandId` and `timeoutMs` 15000 (or the shortened value); it answers `readIrResult`; polling reaches `succeeded` with the button; the `buttons` row has exactly those timings.
  - the device answers `error READ_TIMEOUT` → poll `failed` / `IR_READ_TIMEOUT`; no button.
  - device not connected → `409 DEVICE_OFFLINE` at once.
  - a second learn while one is pending → `409 DEVICE_BUSY`.
  - the device stays silent → poll `expired` / `DEVICE_NOT_RESPONDING` after the shortened TTL; a learn right after is accepted.
  - the device disconnects mid-read → poll `failed` / `DEVICE_NOT_RESPONDING` without waiting for the TTL.
  - "a reconnect does not fail a command sent over the new connection" — connect, reconnect (the first socket is replaced but its close is delayed by not answering the close: terminate the old client only after the learn is sent over the new one), learn over the new connection, then the old socket's close arrives; the command still succeeds when the device answers.
  - the button is saved when nobody polls: answer the read, then poll once at the end → `succeeded`.
  - another user polling the command → `404`; a command settled through a separate `DbHandle` (standing in for another instance) is what the poll reports.
- [ ] **Step 2: Run** `pnpm vitest run --project e2e backend/e2e/learn-buttons.e2e.ts` — Expected: PASS (implementation exists). Mutation check: make `failConnection` ignore `connection_id` → the reconnect test FAILS; restore.
- [ ] **Step 3: Commit** — `git commit -m "Test learning buttons end to end"`.

---

### Task 8: The simulator answers reads; docs; manual run

**Files:**
- Modify: `tools/device-sim/src/{device,commands,terminal,main}.ts` (+ tests), `tools/device-sim/README.md`, `CLAUDE.md`, `backend/README.md`

**Interfaces — Produces:**
- Device: on `readIr` → `· listening for an IR code (15 s)`; state `pendingRead: { commandId, expiresAt } | null` in `status()`; `press(timings?: number[])` sends `readIrResult` (default `SAMPLE_TIMINGS_US`, about 70 NEC-shaped entries) or `· no read in progress` (error); at `timeoutMs` sends `error READ_TIMEOUT` with the `commandId`; a `readIr` while one is pending → `error BUSY` with the new `commandId`; `stop()`/`disconnect()` clear the read timer.
- Commands: `/press` and `/press <t1,t2,…>` (comma-separated integers; bad input → usage); `COMMAND_HELP` gains `/press [t1,t2,…]`.
- Status shows the pending read and its time left.

- [ ] **Step 1: Write the failing tests:** device (listening log, `press` default and given timings, automatic `READ_TIMEOUT` at the timeout, `BUSY`, no read → error, `stop` clears the timer); commands (`/press`, `/press 9000,4500,560`, `/press 9000,x` → usage); terminal status line.
- [ ] **Step 2: Run** `pnpm vitest run --project unit tools` — Expected: FAIL.
- [ ] **Step 3: Implement**; update the README (create a remote, learn, poll with curl, `/press`), `CLAUDE.md` (the `device_commands` flow: commands live in Postgres; only `DeviceConnections` is in-process), `backend/README.md` (the three endpoints).
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Manual run** against an isolated backend (throwaway Postgres, own ports, as before): create a remote with curl; learn → `202`; `/press` in the simulator; poll → `succeeded`; learn again, wait → `failed IR_READ_TIMEOUT`; learn with the simulator stopped → `409 DEVICE_OFFLINE`. Record the results in the ledger.
- [ ] **Step 6: Run** `pnpm lint`, `pnpm typecheck`, `pnpm exec prettier --check .`, `pnpm test`, `pnpm build` — Expected: all clean.
- [ ] **Step 7: Commit** — `git commit -m "Let the simulator answer IR reads, and document learning buttons"`.
