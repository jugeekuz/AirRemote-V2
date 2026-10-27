# Device hello: reporting the firmware version — design

Date: 2026-10-27 · Branch: a new branch off `main`

## Intent

The backend should know which firmware each device runs. It is the third item
of the firmware's OTA groundwork
(`docs/superpowers/specs/2026-10-27-firmware-scaffold-design.md`): the backend
can only decide on updates later if devices report their version from the start.

The version travels in a new device message, `hello`, the first thing a device
sends once its WebSocket is open. The backend stores it on the device's row
and logs it. Nothing uses it yet.

## Decided by the owner

- **A `hello` message**, not a header on the WebSocket upgrade. It is
  validated like every other frame, and other facts about the device can join
  it later.
- **Only the version, only stored and logged.** No API field, no update
  logic, no refusing old firmware: those come later.
- Agreed from the proposal (the owner accepted these as described):
  - `hello` is optional and not enforced. Commands work before it, and a
    device that never sends it keeps no version.
  - It is not a command: no `commandId`, no reply. An invalid `hello` gets the
    usual protocol `error`, like any bad frame.
  - A second `hello` replaces the stored version.
  - The version is `MAJOR.MINOR.PATCH` with an optional `-suffix`, at most 31
    characters (what fits in ESP-IDF's 32-byte app version field).
  - The subprotocol stays `airremote.v1`: the change only adds a message.
  - The simulator sends `hello` on connect, with a version set by a flag.

## Goals

- `deviceMessageSchema` has a `hello` member:
  `{ type: 'hello', firmwareVersion: string }`, strict like the others.
- `devices` has a nullable `firmware_version` column (text), added by a
  generated migration.
- A `hello` from a connected device sets `firmware_version` on its row and
  logs `{ firmwareVersion }` with the message "Device said hello".
- The simulator sends `hello` right after every connection opens.
- Tested at each level the backend uses, including one e2e test over real
  mTLS: connect, send `hello`, the row has the version.

## Non-goals

- The firmware sending `hello`: it has no networking yet.
- `firmwareVersion` in any API response (`deviceResponseSchema` stays as is),
  or in the OpenAPI document.
- When the version was last reported, or a "last seen" time.
- Requiring `hello`, ordering it before commands, or rejecting versions.
- Other `hello` fields (free memory, reset reason, IP).

## Anti-goals

- A device without a version that is treated differently in any way.
- A `hello` that settles, fails or otherwise touches `device_commands`.

## The design

### Contract (`packages/contracts/src/device-protocol/device-protocol.contract.ts`)

- A `firmwareVersionSchema`, exported:
  `z.string().max(31).regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)`. The regex
  message says "must look like 1.2.3 or 1.2.3-beta.1".
- A new `deviceMessageSchema` member, documented like the others ("Sent once
  after connecting: what the device is running. Not a command; no reply."):
  `z.strictObject({ type: z.literal('hello'), firmwareVersion: firmwareVersionSchema })`.
- Contract tests next to the existing ones: valid versions (`0.1.0`,
  `10.20.30`, `1.0.0-beta.1`) pass. These fail: `1.0`, `v1.0.0`, `1.0.0+build`,
  32 characters, an extra key, and a missing `firmwareVersion`.

### Database (`packages/db/src/schema/devices.ts`)

- `firmwareVersion: text('firmware_version')`, nullable, no default.
- Generated with `pnpm db:generate` and committed. No backfill: existing rows
  stay null, which means "never reported".

### Backend

- `DevicesRepository.setFirmwareVersion(deviceId: string, firmwareVersion: string): Promise<void>`
  updates the row. A device deleted in the meantime is a no-op.
- `DevicesService.recordFirmwareVersion(deviceId, firmwareVersion)` calls it.
- `features/devices/devices.socket.ts`:
  `createDevicesSocketHandlers({ service })` returns the `hello` handler. It
  is thin: it calls the service, then logs.
- `DeviceMessageHandlers` requires one handler per message type, so the
  device server combines both features' handlers:
  `{ ...createDevicesSocketHandlers(...), ...createDeviceCommandsSocketHandlers(...) }`.
  Each factory's return type is a `Pick` of `DeviceMessageHandlers`, so the
  combined object still fails to compile when a type has no handler. The
  builder picks the exact typing.
- No change to the gateway, the session or the subprotocol.

### Simulator (`tools/device-sim`)

- A new option `--firmware-version`, default `0.0.0-sim`, validated with
  `firmwareVersionSchema` (an invalid value prints the usage).
- After each connection opens, it sends
  `{ "type": "hello", "firmwareVersion": … }` and logs it like other sent
  messages.
- `/status` shows the version. The README lists the option and says the
  simulator says hello on connect.

### Tests

- **Unit:**
  - the contract cases above;
  - the service calls the repository (fake);
  - the socket handler calls the service and logs;
  - the simulator parses the flag and sends `hello` on open (with its fake
    transport).
- **Integration:**
  - `setFirmwareVersion` sets the column and replaces it on a second call;
  - it leaves other devices alone;
  - it is a no-op for an unknown id.
- **E2E (`backend/e2e/device-messages.e2e.ts` or a new
  `device-hello.e2e.ts`):**
  - an enrolled device connects over mTLS and sends `hello`, and its row's
    `firmware_version` becomes that version;
  - an invalid version gets an `INVALID_MESSAGE` error frame, and the row
    stays null.

## Left to the builder

- File and test names within the conventions in `CLAUDE.md`.
- How the combined handlers are typed.
- Whether the e2e cases join an existing file.

## Notes for the plan

- `createDeviceCommandsSocketHandlers` returns the full `DeviceMessageHandlers`
  today; it narrows to a `Pick`.
- `fakeDevicesService` in `backend/e2e/support/device-server.ts` and any fake
  that builds a `Device` row (`firmwareVersion: null`) need updating.
- The `hello` handler gets no reply, so the e2e test polls the database for the
  stored version; a later frame's reply does not prove the write finished.
- `backend/e2e/device-messages.e2e.ts` uses `{ type: 'hello' }` as its example
  of an unknown type; switch it to a type that will never exist.
