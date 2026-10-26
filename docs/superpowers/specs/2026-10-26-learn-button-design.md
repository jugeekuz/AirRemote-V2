# Creating remotes and learning buttons — design

Date: 2026-10-26 · Branch: a new branch off `main`, once
`feature/remotes-and-buttons` and `feature/ir-messages` are merged (this
change needs both).

## Intent

A user creates a remote on one of their devices, then adds buttons to it the
way V1 did: they name a button, point the physical remote at their AirRemote
and press it. The device reads the IR code and the backend saves the button
with it.

Learning is asynchronous: the backend accepts the request at once and the
frontend polls for its outcome. Commands to devices and their outcomes are
kept in Postgres, not in memory, so that the backend can later run as
several instances with only the WebSocket connections themselves to rework.

## Goals

- `POST /devices/:deviceId/remotes` creates a remote (`name`, `type`).
- `POST /remotes/:remoteId/buttons` with `{ name }` asks the remote's device
  to read a code and answers `202 Accepted` with the command's id.
- `GET /device-commands/:id` tells the frontend where that command is:
  pending, succeeded (with the new button), failed (and why) or expired.
- Every command to a device is a row in Postgres from the moment it is sent
  until it succeeds, fails or expires.
- Everything except holding a device's socket works no matter which
  instance runs it: settling a command, saving its result, answering a poll.
- Every failure gives the user a specific error and saves no button.
- The device simulator answers a read, so the flow can be tried by hand.

## Non-goals

- No running several instances yet. In-process today: whether a device is
  connected, and sending it a command (both `DeviceConnections`). Making
  those work across instances (routing a command to the instance that holds
  the device's socket, a shared online status) is the one piece left for
  that switch.
- No push to the frontend (WebSocket or server-sent events): it polls.
- No listing, renaming or deleting remotes or buttons; no re-learning a
  button; no sending a code (`sendIr`).
- No cleanup of old command rows (they are kept as history for now).
- No firmware.

## Anti-goals

- A half-made button: a `buttons` row without a code.
- State that only one process knows about, other than the socket itself.
- A device answering for another device's command.
- A command reported `pending` forever, or blocking its device, after a crash.
- The user pressing their remote only to be told the name is taken.

## Decided by the owner

- **The flow:** name a button in a remote; the backend finds the remote's
  device and asks it to read; the device reports the code; the button is
  saved.
- **`POST /remotes/:remoteId/buttons` answers `202 Accepted` with the
  request id**, and **the frontend polls a separate endpoint** for that
  request's status.
- **`timings_us` stays required.**
- **Creating a remote is part of this work.**
- **Commands in progress are kept in Postgres, not in memory**, so that
  several instances are limited only by the WebSocket connections.

## Creating a remote — `POST /devices/:deviceId/remotes`

Signed in (`onRequest: app.authenticate`). Body `{ name, type }`: `name`
with the database's name rules (1–100 characters, no leading or trailing
whitespace; the contract trims it), `type` from `remoteTypeSchema`.

- `201 { id, deviceId, name, type }`.
- A device that does not exist or is not the user's → `404 NOT_FOUND`.
- A name already used on that device, ignoring case → `409 REMOTE_NAME_TAKEN`
  (from the unique index, so two concurrent requests cannot both win).

## Device commands — the `device_commands` table

| Column          | Type                    | Notes                                                             |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| `id`            | `uuid`                  | the `commandId` sent to the device and returned to the frontend   |
| `device_id`     | `uuid` → `devices`      | cascade on delete                                                 |
| `kind`          | enum                    | `learn_button` (later: `send_ir`, …)                              |
| `context`       | `jsonb`                 | what finishing it needs; for `learn_button`: `{ remoteId, name }` |
| `status`        | enum                    | `pending`, `succeeded`, `failed`, `expired`                       |
| `error_code`    | `text`, nullable        | set when `failed`                                                 |
| `result_id`     | `uuid`, nullable        | what it produced: the new button's id                             |
| `connection_id` | `uuid`, nullable        | the device connection it was sent over (set when sent)            |
| `created_at`    | `timestamptz`           |                                                                   |
| `expires_at`    | `timestamptz`           | `created_at` + 20 s                                               |
| `finished_at`   | `timestamptz`, nullable |                                                                   |

- **One pending command per device:** a unique index on `device_id` where
  `status = 'pending'`. Creating a command first marks that device's
  `pending` rows whose `expires_at` has passed as `expired`, in the same
  transaction, so a crash between sending and settling never blocks a device
  for longer than the timeout.
- **Settling only once, only by the right device:** every change is
  `UPDATE … WHERE id = $commandId AND device_id = $device AND status =
'pending' AND expires_at > now()`. A late reply, a reply for an unknown id,
  or another device's reply changes nothing and is logged at warn.
- **Expiry is read, not swept:** a `pending` row past `expires_at` is
  reported as `expired` by every read (the poll included), whether or not a
  later write has marked it yet. Nothing has to run on a timer.

## Learning a button — `POST /remotes/:remoteId/buttons`

Signed in. Body `{ name }`, same name rules. Checked in order, answered at
once:

1. **Remote** — not found or not the user's → `404 NOT_FOUND`.
2. **Name** — already used in this remote, ignoring case →
   `409 BUTTON_NAME_TAKEN`. Checked before asking the device.
3. **Device online** (`DeviceConnections.isConnected`, in-process) — not
   connected → `409 DEVICE_OFFLINE`.
4. **Create the command** — a `pending` `learn_button` row with
   `context { remoteId, name }`; the device already has one pending →
   `409 DEVICE_BUSY`.
5. **Send** `readIr { commandId: <id>, timeoutMs: 15000 }` through
   `DeviceConnections` (in-process), and record the connection's id on the
   command. If the device went away in between, the command is marked
   `failed` `DEVICE_OFFLINE` and the answer is `409 DEVICE_OFFLINE`.
6. **Accepted** — `202` with the command (the same body as the poll, below,
   with `status: 'pending'`) and a `Location: /device-commands/<id>` header.

## Polling — `GET /device-commands/:id`

Signed in. The command must be on one of the user's devices; otherwise (or
if it does not exist) → `404 NOT_FOUND`.

```json
{
  "id": "…",
  "kind": "learn_button",
  "status": "pending | succeeded | failed | expired",
  "createdAt": "…",
  "expiresAt": "…",
  "error": { "code": "IR_READ_TIMEOUT", "message": "…" },
  "button": { "id": "…", "remoteId": "…", "name": "Power" }
}
```

- `error` only when `failed` or `expired`; `button` only when a
  `learn_button` command `succeeded`.
- The frontend polls about once a second until the status is not `pending`;
  `expiresAt` tells it when the backend will give up (20 s after creation).

What `error.code` is for each way a command ends:

| How the command ended                    | `status`    | `error.code`            |
| ---------------------------------------- | ----------- | ----------------------- |
| the device read a code; button saved     | `succeeded` | —                       |
| device `error` `READ_TIMEOUT`            | `failed`    | `IR_READ_TIMEOUT`       |
| device `error` `CAPTURE_TOO_LONG`        | `failed`    | `IR_CODE_TOO_LONG`      |
| device `error` `BUSY`                    | `failed`    | `DEVICE_BUSY`           |
| device `error` `INVALID_COMMAND`/`INTERNAL` | `failed` | `DEVICE_ERROR`          |
| the connection it was sent over closed   | `failed`    | `DEVICE_NOT_RESPONDING` |
| no reply by `expiresAt`                  | `expired`   | `DEVICE_NOT_RESPONDING` |
| the name was taken meanwhile             | `failed`    | `BUTTON_NAME_TAKEN`     |

The stored `error_code` keeps the device's own code; the mapping to these
codes is done when answering. `error.code` values come from `errorCodeSchema`.

New error codes in `errorCodeSchema`: `REMOTE_NAME_TAKEN`,
`BUTTON_NAME_TAKEN`, `DEVICE_OFFLINE`, `DEVICE_BUSY`, `IR_READ_TIMEOUT`,
`IR_CODE_TOO_LONG`, `DEVICE_ERROR`, `DEVICE_NOT_RESPONDING`.

## Settling, wherever the device's socket is

The device server's handlers settle commands in Postgres; nothing in them
depends on which process the HTTP requests reach.

- **`readIrResult`** for a `learn_button` command: in one transaction, insert
  the button (`remoteId`, `name` from `context`, the timings) and mark the
  command `succeeded` with `result_id`. If the insert hits the unique name
  index (someone took the name meanwhile), mark it `failed`
  `BUTTON_NAME_TAKEN` instead.
- **`error` with a `commandId`**: mark it `failed` with the device's code.
  An `error` without one is logged, as today.
- **A device connection closes** (disconnect, or replaced by a newer
  connection): mark the `pending` commands **sent over that connection**
  `failed` `DEVICE_DISCONNECTED`. Every connection gets a random id when it
  is opened; a command records it when sent (`connection_id`). A replaced
  socket can take up to 30 s to report its close (`ws` waits for the peer's
  close frame); scoping to the connection means that late close never fails
  a command already sent over the device's new connection, on this instance
  or another.

The button is saved when the code arrives, whether or not anyone is still
polling.

## Timings

The device reads for 15 s (`timeoutMs`); the command expires 20 s after it
was created, leaving 5 s for the reply to arrive. Both are options of the
service, so tests can shorten them.

## Layers (as `CLAUDE.md` requires)

- `features/remotes/`: routes, service, repository for creating a remote.
- `features/buttons/`: the learn route and service (steps 1–6).
- `features/device-commands/`: the poll route; the table's repository
  (create, settle, fail a connection's pending commands, read with expiry
  applied); and `device-commands.socket.ts` with the `readIrResult` and
  `error` handlers. Completing a `learn_button` command inserts the button in
  the same transaction, in this repository.
- `devices.socket.ts` goes away: its only handler (logging device errors)
  moves into `device-commands.socket.ts`, so each message type still has
  exactly one handler.
- `DeviceConnections.register` returns the connection's id; the session
  passes it to the close hook. `DeviceConnections` is passed to `buildApp`
  as well as the device server; `server.ts` and `useDeviceServer({ api:
true })` share the same instance.
- Contracts in `@airremote/contracts`: `remotes/` (create request and
  response), `buttons/` (learn request), `device-commands/` (the poll
  response, also the `202` body).

## The simulator

When it receives `readIr`, it logs `listening for an IR code (15 s)` and
waits, as a device would:

- `/press` sends a `readIrResult` with a sample code (about 70 timings, NEC
  shaped); `/press <t1,t2,…>` sends the given timings as typed;
- at the timeout it sends `error READ_TIMEOUT` on its own;
- a second `readIr` while one is pending is answered `error BUSY`;
- `/status` shows a pending read and its time left.

## Testing

- Unit: the services with fake repositories (every pre-check answered before
  anything is created or sent; the `202` body); the poll's mapping of every
  row of the outcomes table; routes with fake services (`202` and the
  `Location` header); the simulator's `/press`, automatic `READ_TIMEOUT` and
  `BUSY`.
- Integration (real Postgres): creating a command expires overdue ones and
  refuses a second pending one; settling only matches pending, unexpired,
  same-device rows; completing `learn_button` inserts the button and the
  command together, and turns a name clash into `failed BUTTON_NAME_TAKEN`;
  a connection's close fails only the commands sent over it; a pending row
  past `expires_at` reads as `expired`; remotes' create and ownership checks.
- E2E (`useDeviceServer({ api: true })`, a test device over real mTLS):
  create a remote; learn a button (`202`), poll until `succeeded`, and find
  exactly the device's timings saved; `READ_TIMEOUT` polls to `failed
IR_READ_TIMEOUT` and no button; offline gives `409` at once; a silent
  device polls to `expired` (shortened); a device that disconnects mid-read
  polls to `failed DEVICE_NOT_RESPONDING` at once; another user's device,
  remote or command gives `404`; a command settled through a **separate
  database connection** (standing in for another instance) is what the poll
  reports.
- Manual: the simulator against `pnpm dev`, curl to create a remote, learn a
  button and poll, `/press`.

## Calls made in design, not by the owner

- Paths and bodies; `GET /device-commands/:id` as the polling endpoint, the
  `202` body equal to the poll's, with a `Location` header.
- The poll's shape (`status`, `error`, `button`) and the error codes.
- The `device_commands` table and its columns; `kind` and `context` so other
  commands reuse it; rows kept as history.
- Expiry decided when reading, plus marking overdue rows when a new command
  is created; no timer or sweeper.
- The device server saving the button when the code arrives.
- A connection id per device connection, so a close fails only the commands
  sent over it.
- 15 s read, 20 s expiry; polling about once a second.
- The `error` handler moves into `device-commands`, one handler per type.
- The simulator's `/press` and its automatic timeout.

## Left to the builder

- The enum and constraint names; how `context` is typed in TypeScript.
- The sample code `/press` sends; how the e2e test device is written.
