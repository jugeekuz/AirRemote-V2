# Pressing buttons, listing remotes and buttons — design

Date: 2026-10-26 · Branch: a new branch off `main`

## Intent

Users can now create remotes and learn buttons. This change lets them use
them: list their remotes, list a remote's buttons, and press a button — the
backend sends the button's IR code to the device, the device replays it and
confirms it went out (or says why not), and the UI shows that confirmation.

Pressing works like learning: the request is accepted at once (`202`) with a
device command, and the UI polls `GET /device-commands/:id` until the device
has answered. Everything about the command lives in Postgres, as for
learning, so only the WebSocket connection itself is tied to one instance.

## Goals

- `GET /devices` — the signed-in user's devices.
- `GET /remotes` — the signed-in user's remotes, across their devices.
- `GET /remotes/:remoteId/buttons` — a remote's buttons.
- `POST /buttons/:buttonId/press` — sends the button's code to its device and
  answers `202` with the command; the poll reports `succeeded` once the device
  confirms, or the reason it failed.
- The device protocol gains the command and its reply; the device can report
  that sending failed.
- The simulator logs a received code and confirms it, and can be told to
  fail instead, so both outcomes can be tried by hand.

## Non-goals

- No renaming, deleting or reordering remotes or buttons.
- No push to the UI; it polls.
- No repeat / hold-to-repeat (e.g. holding volume up).
- No sending codes to several devices at once, no schedules.
- No firmware.
- No running several instances yet (as before, only `DeviceConnections` is
  in-process).

## Anti-goals

- A press reported as done before the device said so.
- A user reaching another user's remotes, buttons or commands.
- A press left `pending` forever, blocking the device.
- The IR timings sent to the UI (it has no use for them).

## Decided by the owner

- **The UI gets confirmation from the device** that the code was sent, or an
  error.
- **Pressing answers `202` with the command and the UI polls**, as for
  learning.
- **`GET /devices`, `GET /remotes` and `GET /remotes/:remoteId/buttons`** are
  part of this work.
- **The mock device logs the code and reports back success or an error.**

## Listing — `GET /devices`, `GET /remotes` and `GET /remotes/:remoteId/buttons`

Signed in (`onRequest: app.authenticate`).

- `GET /devices` → `200 [{ id, macAddress, name }]` (the existing
  `deviceResponseSchema`): the user's devices, ordered by name ignoring case,
  then id. No online status (see "Calls made in design").
- `GET /remotes` → `200 [{ id, deviceId, name, type }]`: every remote on the
  user's devices, ordered by name ignoring case, then id. An empty list when
  there are none.
- `GET /remotes/:remoteId/buttons` → `200 [{ id, remoteId, name }]`, ordered
  by name ignoring case, then id. A remote that does not exist or is not the
  user's → `404 NOT_FOUND`. No timings.

Response schemas in `@airremote/contracts`: arrays of the existing
`remoteResponseSchema` and `buttonResponseSchema`.

## Pressing — `POST /buttons/:buttonId/press`

Signed in. No body. In order, answered at once:

1. **Button** — not found or not on one of the user's devices (button →
   remote → device → user) → `404 NOT_FOUND`.
2. **Device online** (`DeviceConnections.isConnected`) — not connected →
   `409 DEVICE_OFFLINE`.
3. **Create the command** — a `pending` `send_ir` row, `context { buttonId }`,
   expiring **5 s** after creation (Postgres `now()`); the device already has
   a pending command (a press or a learn) → `409 DEVICE_BUSY`.
4. **Send** `sendIr { commandId, timingsUs }` (the button's timings) through
   `DeviceConnections`, recording the connection's id on the command. Lost in
   between → the command fails `DEVICE_OFFLINE`, answer `409 DEVICE_OFFLINE`.
5. **Accepted** — `202` with the command (the poll's body) and
   `Location: /device-commands/<id>`.

The UI is expected to disable a button while its press is pending; a second
press on the same device before the first is confirmed is `409 DEVICE_BUSY`
(see "Calls made in design").

### The protocol

In `@airremote/contracts`, `device-protocol`:

- server → device `sendIr { commandId, timingsUs }` (`timingsUs` with the
  existing `irTimingsSchema`: 1–2048 entries, 0–65535). The largest one fits
  the gateway's 16 KiB frame, as `readIrResult` does.
- device → server `sendIrResult { commandId }` — the code went out.
- New device error code `SEND_FAILED` — the device could not send it.
  `BUSY` and `INVALID_COMMAND` / `INTERNAL` apply as before.

### Settling

In the device server, as for learning, matching only a `pending`, unexpired
command of the same device and of kind `send_ir`:

- `sendIrResult` → `succeeded`, `finished_at` set. Nothing else is written.
- `error` with the `commandId` → `failed` with the device's code.
- The connection closes → that connection's pending commands fail
  `DEVICE_DISCONNECTED` (already in place).
- A reply that matches nothing is logged at warn and dropped (already in
  place for learning).

### Polling

`GET /device-commands/:id` is unchanged apart from:

- `kind` can be `send_ir`;
- a succeeded `send_ir` command has no `button` field (only a succeeded
  `learn_button` does);
- `SEND_FAILED` maps to a new API code `IR_SEND_FAILED`; every other mapping
  is as today (`BUSY` → `DEVICE_BUSY`, disconnect or expiry →
  `DEVICE_NOT_RESPONDING`, `INVALID_COMMAND`/`INTERNAL` → `DEVICE_ERROR`).

New API error code in `errorCodeSchema`: `IR_SEND_FAILED`.

### Data

- `device_command_kind` gains `send_ir` (new migration; adding an enum value
  is the only change). `LearnButtonContext` gets a sibling
  `SendIrContext = { buttonId }`.
- No new table.

### Timings

A press expires 5 s after it is created (replaying a code takes the device
well under a second). Like learning's timings, it is an option of the
service so tests can shorten it.

## The simulator

When it receives `sendIr`, it logs `sending an IR code (N timings)` and,
after a short pause standing in for the transmission (about 100 ms), answers
`sendIrResult`. With `/send-fails on` it answers `error SEND_FAILED` instead
(`/send-fails off` restores it). A `sendIr` while a read is listening is
answered `error BUSY`. `/status` shows whether sends are set to fail.

## Layers

- `features/devices/`: `GET /devices` (route, service, repository).
- `features/remotes/`: `GET /remotes` (route, service, repository).
- `features/buttons/`: `GET /remotes/:remoteId/buttons` and the press route
  and service (steps 1–5 through the device-commands service).
- `features/device-commands/`: `startSendIr`, settling `sendIrResult`, the
  `send_ir` kind in the poll mapping.
- Contracts: the two list responses, the protocol messages, the new codes.
- Docs: `backend/README.md` (the three endpoints), the simulator README
  (pressing with curl, `/send-fails`), `CLAUDE.md` only if a convention
  changes.

## Testing

- Unit: contracts (the new messages, the largest `sendIr` within 16 KiB);
  the press service with fakes (every pre-check before anything is created
  or sent, the `202` body); the poll mapping for `send_ir` and
  `IR_SEND_FAILED`; routes (`401`, `404`, `202` + `Location`, no timings in
  any response); the simulator (`sendIr` confirmed, `/send-fails`, `BUSY`
  during a read).
- Integration: listing returns only the user's remotes and buttons, in order;
  a `send_ir` command completes only for the same device and kind, only
  while pending and unexpired; a press and a learn on one device cannot both
  be pending.
- E2E (`useDeviceServer({ api: true })`, a test device over mTLS): press →
  the device receives exactly the button's timings → it confirms → the poll
  says `succeeded`; it answers `SEND_FAILED` → `failed IR_SEND_FAILED`; it
  stays silent → `expired` after the (shortened) TTL; offline → `409`; busy
  during a learn → `409`; another user's button → `404`; both lists.
- Manual: the simulator against `pnpm dev`, pressing with curl.

## Calls made in design, not by the owner

- `GET /devices` has no online flag: whether a device is connected is known
  only to the instance holding its socket, so it waits for the shared online
  status of the multi-instance work.
- Paths: `GET /remotes`, `GET /remotes/:remoteId/buttons`,
  `POST /buttons/:buttonId/press` (the button id alone identifies it).
- List shapes, ordering by name, no pagination (a user has a handful of
  remotes and buttons).
- Protocol names `sendIr` / `sendIrResult`, device code `SEND_FAILED`, API
  code `IR_SEND_FAILED`.
- A press expires after 5 s, fixed rather than scaled to the code's length
  (the schema allows a code far longer than 5 s in theory; captured codes are
  well under a second).
- One pending command per device for presses too: a second press before the
  first is confirmed is `409 DEVICE_BUSY`, and the UI disables the button
  meanwhile. (Queueing presses would let a burst of taps pile up and fire
  late.)
- A succeeded press reports no button in the poll.
- The simulator confirms after ~100 ms; `/send-fails on|off`.

## Left to the builder

- Names of the new service and repository methods.
- The migration's name.
- How the e2e test device is written.
