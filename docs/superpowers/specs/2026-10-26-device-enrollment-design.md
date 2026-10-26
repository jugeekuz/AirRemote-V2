# Device enrollment — design

Date: 2026-10-26 · Branch: `rewrite/backend`

## Intent

A user adds an AirRemote to their account. After Wi-Fi setup (out of scope),
the device shows a QR code; the UI (not built yet) scans it and calls the
backend, which records the device under the user. From then on the device
gateway lets it connect: the gateway already allows a device when a
`devices` row has its MAC address.

Every device ships with a factory certificate whose CN is its MAC address.
Enrollment issues nothing; it decides **who owns** a device that is already
genuine.

A MAC address alone is not proof of ownership: devices broadcast it over
Wi-Fi, so anyone nearby could claim someone else's device first. Enrollment
therefore needs a short-lived **pairing code** that the server gives the
device over mTLS and the device shows in its QR code. Enrolling proves both
that the device is genuine (it held a factory certificate) and that the
person can see its screen.

## Goals

- A device asks the device listener for a pairing code, authenticated by its
  client certificate.
- A signed-in user enrolls a device with its MAC address, that pairing code
  and a name; the device is created under the user.
- The first protected endpoint of the API, and with it a reusable
  "must be signed in" check that later endpoints use.
- Tested at every level the project uses, including one e2e test of the whole
  flow: code → enroll → the device connects.

## Non-goals

- No UI, no QR code generation, no firmware changes. The firmware will call
  the pairing endpoint and draw the QR code later.
- No listing, renaming, deleting or transferring devices.
- No un-enrolling or factory reset flow.
- No rate limiting (see "Guessing codes").
- No changes to the WebSocket protocol or the gateway's rules.

## Anti-goals

- A device enrolled by someone who only knows its MAC address.
- A response that tells a stranger whether a MAC is enrolled, or by whom.
- A pairing code that works twice, after it expires, or for another device.
- A pairing code stored in a form that lets someone with database access
  enroll devices.

## Decided by the owner

- **Enrollment whitelists the device by its MAC address**, under the
  signed-in user's id. The factory certificate is already on the device.
- **The name is required.**
- **409 when the device is already registered.**
- **Ownership is proven with a server-issued pairing code** (option A): the
  device fetches it over mTLS and shows it in its QR code; the UI sends it
  with the MAC.
- **Codes expire after 15 minutes.**
- Out of scope: Wi-Fi setup, the QR code, the UI, anything after enrollment.

## How it works

### 1. The device asks for a code — `POST /pairing-code` on the device listener

- Served by the existing device server (`src/device-server.ts`), over the
  same mTLS. It is a plain HTTP route next to `GET /ws`.
- The device is identified by its certificate CN, which must be a single
  string that is a valid MAC address — the same rule the WebSocket upgrade
  uses today (`device-upgrade.ts`). That rule moves somewhere both can use;
  it is not copied.
- No request body.
- Responses (all in the shared error envelope on failure):
  - `201 { pairingCode, expiresAt }` — `expiresAt` is ISO 8601, 15 minutes
    from now.
  - `403 INVALID_DEVICE_CERTIFICATE` — no single CN, or the CN is not a MAC.
  - `409 DEVICE_ALREADY_REGISTERED` — a `devices` row already has this MAC.
    The firmware takes this as "go straight to the WebSocket".
- Asking again replaces the device's previous code: at most one code is live
  per device.
- The device server gains the Zod validator/serializer the API has
  (`zodPlugin`), so the response is validated like every API response.
- Successful issues are logged at info with the MAC, never with the code.

### 2. The user enrolls — `POST /devices` on the API

- Signed-in users only (see §3).
- Body: `{ macAddress, pairingCode, name }`
  - `macAddress`: `AA:BB:CC:DD:EE:FF` with colons, any case. Stored in lower
    case — the form `parseMacAddress` already produces and the gateway looks
    up. Other formats are rejected; the UI converts.
  - `pairingCode`: see "Code format".
  - `name`: trimmed, 1–100 characters (same rule as user names).
- The code is checked before anything else about the device, and these are
  indistinguishable to the caller:
  - no code issued for this MAC, a wrong code, an expired code, a used code
    → `400 INVALID_PAIRING_CODE`.
- With a valid code, consuming the code and creating the device happen in
  **one transaction**: either both happen or neither does. Two requests with
  the same valid code cannot both succeed.
- Responses:
  - `201 { id, macAddress, name }`.
  - `400 INVALID_PAIRING_CODE` as above.
  - `409 DEVICE_ALREADY_REGISTERED` — the code was valid but the MAC is
    already enrolled (the unique constraint on `devices.mac_address` decides,
    as `users.repository` lets the email constraint decide). Rare: the device
    listener refuses codes to enrolled devices, so this needs a race.
  - `401 UNAUTHORIZED` — see §3.
  - `400 VALIDATION_FAILED` — bad body, through the existing validation.
- Successful enrollments are logged at info with the device id, MAC and user
  id.

### 3. The sign-in check

- A plugin that reads `Authorization: Bearer <token>`, verifies it with the
  existing `verifyAccessToken` (`features/auth/auth.helpers.ts`) and the
  JWT secrets from env, and makes the user id available to the route.
- Routes opt in per route; unprotected routes (health, register, login,
  refresh, logout) stay as they are.
- Missing header, not `Bearer`, invalid, expired, or a refresh token used as
  an access token → `401 UNAUTHORIZED` with `WWW-Authenticate: Bearer`.
- It checks the token only, not that the user still exists: there is no way
  to delete a user yet.

### Code format

- 8 characters from Crockford's base32 alphabet
  (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no I, L, O, U), generated with a
  cryptographically secure random source. The device listener returns it in
  upper case without separators.
- Accepted on enrollment in any case, with hyphens and spaces ignored, so it
  can be typed by hand if a camera fails. Look-alikes are mapped as Crockford
  does: `O` → `0`, `I` and `L` → `1`. Anything else outside the alphabet, or
  the wrong length after normalising, is a `400 VALIDATION_FAILED`.

### Storage — `pairing_codes` table

- One row per device: `mac_address` (macaddr, primary key), `code_hash`
  (text), `expires_at` (timestamptz).
- Only an HMAC-SHA256 of the normalised code is stored, keyed with a new
  server secret `PAIRING_CODE_SECRET` that the database never sees. A plain
  hash would not do: 32⁸ ≈ 2⁴⁰ codes can be brute-forced from a stolen hash
  in minutes on a GPU, so someone who could read the table (a backup, a dump)
  could recover a live code. With the key, a stolen table is useless on its
  own. Write access is not the concern: anyone who can write can insert a
  `devices` row directly.
- `PAIRING_CODE_SECRET` is required, validated like the JWT secrets
  (`src/config/env.ts`), and added to `.env.example`, `docker-compose.yml`,
  `testEnv` and `backend/README.md`. It is its own variable, not derived from
  a JWT secret. It is passed to the service through its `create*` factory.
- Issuing a code upserts the row for the MAC. Consuming it deletes the row.
  Expired rows stay until the device asks again; nothing sweeps them.
- No foreign key: the device does not exist yet when its code is issued.
- New table in `packages/db/src/schema/`, migration generated with
  `pnpm db:generate`.

### Guessing codes

A code is 32⁸ ≈ 10¹² possibilities, valid for one MAC for 15 minutes.
Guessing one over HTTP inside that window is not practical, so this change
adds no rate limiting or attempt counting. A later rate-limiting change can
cover the whole API.

### Gateway

- No behaviour change. The comment in `devices.service.authorizeConnection`
  that calls the rule a placeholder is updated: enrollment is now how a
  `devices` row is created, so the rule is the real one.

### Contracts

- In `@airremote/contracts`, folder `devices/`: the enroll request and
  response schemas and the pairing-code response schema.
- New error codes in `errorCodeSchema`: `UNAUTHORIZED`,
  `INVALID_PAIRING_CODE`, `DEVICE_ALREADY_REGISTERED`,
  `INVALID_DEVICE_CERTIFICATE`.

## Testing

- Unit: code generation and normalisation, the service's decisions with fake
  repositories, both routes with fake services, the sign-in check.
- Integration: the repository against Postgres, including that a code cannot
  be consumed twice and that a failed device insert leaves the code unused.
- E2E:
  - pairing over real mTLS (issued, replaced, refused for an enrolled device,
    refused for a bad CN);
  - enrollment over HTTP with a real login (each response above);
  - the whole flow on one database: the device gets a code, the user enrolls
    with it, the device's WebSocket connection is then accepted where it was
    refused before. `useTestApp()` and `useDeviceServer()` each create their
    own database today, so this needs the two servers to share one.

## Calls made in design, not by the owner

- `POST /pairing-code` on the device listener (plain HTTP over mTLS), not a
  WebSocket message: unenrolled devices still never get a socket.
- One live code per device; asking again replaces it.
- `400 INVALID_PAIRING_CODE` for every bad-code case, checked before the
  MAC's enrollment status, so the endpoint reveals nothing about a MAC.
- The 8-character Crockford base32 format, typeable by hand.
- HMAC-SHA256 with `PAIRING_CODE_SECRET`, from the design review.
- No rate limiting.
- The sign-in check verifies the token only.

## Left to the builder

- File and function names, within the conventions in `CLAUDE.md`.
- Where the shared CN-to-MAC check lives.
- How the sign-in check hands the user id to routes (a request decorator, a
  preHandler, or both).
- How e2e tests make mTLS HTTP requests (e.g. an `https` request or an
  undici `Agent` with the client certificate).
