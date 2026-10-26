# Device gateway — design

Date: 2026-10-26 · Branch: `rewrite/backend`

## Intent

AirRemote devices (ESP boards) will talk to the backend over WebSockets, and
only devices will. Users keep using the HTTP API. This change builds the
transport that later features send device messages through: a separate TLS
listener that authenticates devices with client certificates, and one
gateway that validates every message in both directions against a shared
Zod protocol.

No feature sends a device anything yet (remotes have no buttons or IR codes),
so this change carries the transport and the protocol's skeleton only. The
first real messages arrive with the feature that needs them.

V1's connection model is not a reference for this work.

## Goals

- A second listener, on its own port with its own TLS configuration,
  serving WebSocket connections from devices only.
- Devices prove who they are with mutual TLS. A device that is not allowed
  has its connection dropped.
- A placeholder for onboarding/allowlisting, in one function, so the real
  process can replace it without touching the transport.
- Every message is validated: frames coming in against the device→server
  schema, messages going out against the server→device schema.
- The protocol schemas live in `@airremote/contracts`.
- A registry of connected devices, and dead connections detected and
  dropped.
- Tested at every level the project uses: unit, integration, e2e over real
  TLS.

## Non-goals

- **No command messages** (execute IR code, read IR code, ack) and no
  request/reply matching. They come with the buttons feature, designed
  against the code that calls them.
- **No onboarding.** How a person registers a device, and what "registered"
  means in the data, is a later feature. This change has a placeholder.
- **No certificate tooling.** No `scripts/dev-certs.sh`, no CA management,
  no issuing or revoking device certificates. The owner does that in a
  second step.
- No device online/offline status in the database or the HTTP API.
- No JSON Schema export or shared fixtures for the firmware. The firmware
  re-implements the protocol by hand.
- No frontend or firmware changes.

## Anti-goals

- A device message sent or handled anywhere except through the gateway, i.e.
  unvalidated.
- A device allowed in because a check was skipped: an allowlist that fails
  open.
- Transport code (sockets, frames, close codes) leaking into services.

## Decided by the owner

- **Only devices use WebSockets.**
- **Its own TLS listener**, configured separately from the main API because
  it uses different certificates.
- **A strict message format, validated on input and output**, with Zod
  schemas in contracts. The server is the one that validates; the firmware
  re-implements the format.
- **Devices authenticate with mTLS.**
- **Devices are onboarded/allowlisted by a person through a process that
  does not exist yet.** A device that is not allowed has its connection
  dropped. This change contains a placeholder for it.
- **Scope: transport only** (see Non-goals).
- **No dev certificate script in this change.**

## How it works

### Process layout

One process runs two Fastify instances:

- the existing HTTP API (`buildApp`), unchanged apart from sharing the
  database connection;
- a new device server (`buildDeviceServer`), HTTPS with a single WebSocket
  route.

They share one database connection pool and one connection registry.
`server.ts` starts both, and on SIGINT/SIGTERM closes both and then the
pool, once. Keeping one process means a later HTTP route ("press this
button") reaches the device's socket through the in-memory registry with no
message bus. The registry sits behind a small interface so the device server
can be moved to its own process later without touching features.

### Configuration

New variables, validated in `src/config` like the rest:

| Variable               | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| `DEVICE_PORT`          | Port of the device listener, default `8443`         |
| `DEVICE_TLS_CERT_FILE` | Path to the server certificate (PEM) devices see    |
| `DEVICE_TLS_KEY_FILE`  | Path to its private key (PEM)                       |
| `DEVICE_TLS_CA_FILE`   | Path to the CA (PEM) that signs device certificates |

The three file variables are **all or none**:

- all three set → the device server starts; a missing or unreadable file
  stops startup with a clear message, like an invalid `DATABASE_URL`;
- none set → the device server does not start, and the API logs one warning
  saying so;
- only some set → configuration error.

This keeps `docker compose up` and `pnpm dev` working until the certificate
step exists. Only `src/config` reads the files.

The same `.env` serves `pnpm dev` on the host and Compose, so the paths in
it are **host paths**, used as-is by `pnpm dev` (absolute paths are
recommended; relative ones resolve against `backend/`, the dev process's
working folder). Compose uses them only to know whether certificates are
configured:

- Certificates live in the repository's `certs/` folder (git-ignored) under
  fixed names: `device-server.crt`, `device-server.key`, `device-ca.crt`.
- Compose mounts `./certs` at `/certs` read-only (with the `z` SELinux
  label, needed on Fedora hosts), and sets each container variable only when
  the host one is set, e.g.
  `DEVICE_TLS_CERT_FILE: ${DEVICE_TLS_CERT_FILE:+/certs/device-server.crt}`.
  Blank in `.env` → blank in the container → device server off.
- The container runs as the `node` user (uid 1000), so the key must be
  readable by uid 1000. The README says so.
- Compose publishes `DEVICE_PORT`.

`.env.example` documents the variables, left blank.

### TLS and identity

- The listener requires a client certificate signed by the device CA
  (`requestCert` + `rejectUnauthorized`). A connection without one, or with
  one from another CA, fails during the TLS handshake and never reaches
  HTTP.
- **A device's identity is its certificate's Subject CN, which is its MAC
  address** (`AA:BB:CC:DD:EE:FF`, any case). A CN that is not a MAC address
  is rejected like an unknown device.

### Allowing a device (the placeholder)

- On the WebSocket upgrade request the server reads the peer certificate's
  CN and calls `devicesService.authorizeConnection(macAddress)`, which
  returns the device or `null`.
- `null` → the upgrade is answered `403` and the connection closed. Nothing
  else is sent; the device learns nothing about why.
- **Placeholder rule:** a device is allowed when a `devices` row has that
  MAC address. Nothing creates those rows yet, so in practice no device
  connects until onboarding exists; tests insert a row. Onboarding replaces
  the body of this one function.
- It fails closed: a database error during the check is a rejection, not an
  allow.
- A device removed while it is connected stays connected until it
  disconnects. Out of scope.

### Handshake

- One route, `GET /ws`. Anything else on the device port is a `404`.
- The device must request the subprotocol `airremote.v1`
  (`Sec-WebSocket-Protocol`). A missing or different subprotocol is
  rejected at the upgrade. A new protocol version later is a new
  subprotocol name.

### The protocol (`@airremote/contracts`, `device-protocol/`)

- Two Zod discriminated unions on `type`, every member a strict object
  (unknown keys rejected):
  - `deviceMessageSchema` — device → server;
  - `serverMessageSchema` — server → device.
- Inferred types `DeviceMessage` and `ServerMessage` are exported with them.
- Messages in this change:
  - server → device `error`: `{ type: 'error', code, message }`, where
    `code` is one of a fixed `deviceProtocolErrorCodeSchema` list:
    `INVALID_JSON`, `INVALID_MESSAGE`, `UNSUPPORTED_FRAME`;
  - device → server `error`: `{ type: 'error', message }` with `message` a
    non-empty string of at most 200 characters. The device reports a
    failure on its side; the server logs it.
- Both unions are built so adding a member is one line each. A new message
  type that has no handler is a type error (see Gateway).

### Gateway

One module owns the socket. Nothing else imports `ws` or
`@fastify/websocket` (ESLint enforces it, like the Drizzle rule; tests are
exempt).

Incoming frame, in order:

1. Frames over **16 KiB** close the socket with `1009` (the WebSocket
   library does this; no reply is possible).
2. A binary frame → `error` reply, code `UNSUPPORTED_FRAME`.
3. Text that is not JSON → `error` reply, `INVALID_JSON`.
4. JSON that fails `deviceMessageSchema` → `error` reply,
   `INVALID_MESSAGE`, with a short description of the first problem.
5. A valid message → its handler, chosen by `type`.

After **5 bad frames in a row** (steps 2–4) the socket is closed with
`1008`. A valid frame resets the count.

Handlers are given as a map typed
`{ [T in DeviceMessage['type']]: (message, ctx) => Promise<void> }`, where
`ctx` carries the device (id, MAC). A handler that throws is logged and the
socket stays open; the device gets no reply (that is a server bug, not the
device's).

Outgoing: one `send(deviceId, message: ServerMessage)` validates against
`serverMessageSchema` before serialising. A message that fails is a server
bug: it is logged and not sent, and `send` throws. Sending to a device that
is not connected is a no-op that returns `false` (`true` when sent).

### Connection registry

- Maps device id → its socket, shared through the interface
  `send(deviceId, message)`, `isConnected(deviceId)`.
- **The newest connection wins:** when a device connects while it already
  has a socket, the old one is closed with `4000` ("replaced").
- Removing an entry on close only removes the socket it was registered for,
  so the replaced socket closing does not unregister the new one.

### Keeping connections honest

- The server pings every connected socket every **30 seconds**. A socket
  that has not answered the previous ping is terminated. The interval is an
  option of `buildDeviceServer` so tests can shorten it; it is not
  configuration.
- On shutdown every device socket is closed with `1001` before the server
  stops.

### Logging

Connect and disconnect at `info` with the device id and MAC (and close
code). Rejected handshakes, bad frames and device `error` messages at `warn`.
Never log certificate contents.

## Where the code goes

This follows the existing conventions in `CLAUDE.md`:

- `backend/src/device-server.ts` — `buildDeviceServer(...)`, the device
  side's `app.ts`.
- `backend/src/plugins/` — the gateway (upgrade, authorization hook, frame
  handling, heartbeat) as a Fastify plugin registered by the device server.
- `backend/src/shared/` — the connection registry, since later HTTP features
  use it too.
- `backend/src/features/devices/` — a new feature:
  - `devices.repository.ts` — `findByMacAddress`;
  - `devices.service.ts` — `authorizeConnection`;
  - `devices.socket.ts` — the device message handlers. **New file kind**:
    `<feature>.socket.ts` is to WebSocket messages what `.routes.ts` is to
    HTTP: thin, it only calls the service. Added to `CLAUDE.md`.
- `packages/contracts/src/device-protocol/` — the schemas.
- `backend/src/config/` — the new variables and reading the PEM files.

The exact module split inside `plugins/` and `shared/` is the builder's.

## Testing

- **Unit:**
  - contract schemas: each member accepted, unknown keys and unknown types
    rejected;
  - CN parsing: valid MACs in any case accepted, everything else rejected;
  - `authorizeConnection` with a fake repository, including the
    fail-closed case;
  - the gateway's frame handling with a fake socket: each bad-frame path
    and its reply, the 5-in-a-row close, the reset, dispatch, handler
    throwing, outgoing validation;
  - the registry: newest wins, a replaced socket's close does not
    unregister the new one;
  - config: all-or-none, unreadable file.
- **Integration:** `devices.repository.findByMacAddress` against Postgres,
  including a MAC in a different case from the stored one.
- **E2E**, the real device server over real TLS with a `ws` client:
  - certificates are generated for the run by the test setup (a throwaway
    CA, a server certificate for `localhost`, device certificates, and one
    from a second CA), into a temporary folder; no keys are committed. This
    is a test helper, not the dev script that was deferred;
  - cases: no client certificate and a foreign-CA certificate fail the
    handshake; a valid certificate with no `devices` row gets `403`; a
    CN that is not a MAC gets `403`; a wrong or missing subprotocol is
    rejected; an allowed device connects; each bad-frame path gets its
    `error` reply; 5 bad frames close with `1008`; an oversized frame
    closes with `1009`; a second connection closes the first with `4000`;
    a client that stops answering pings is dropped; shutdown closes with
    `1001`; a device `error` message is accepted without a reply;
  - the HTTP API's e2e tests keep passing with the device server off.

## Documentation

- `CLAUDE.md`: the `.socket.ts` file kind, the gateway being the only owner
  of sockets, and device messages living in contracts.
- `backend/README.md`: the device listener, its variables, and that it stays
  off until certificates are configured.

## Left to the builder

- Library versions (`@fastify/websocket` with `ws` is the expected choice).
- Module and file names inside `plugins/`, `shared/` and `config/`.
- How the shared database pool is handed to both servers and closed once.
- How the e2e setup generates certificates (`openssl` or a library), as
  long as nothing private is committed.

## Done when

- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass.
- `docker compose up` still works with no certificates configured, the API
  logging that the device server is off.
- With certificates configured, an allowed device connects over mTLS on
  `DEVICE_PORT`, and every rejection case above behaves as described.
