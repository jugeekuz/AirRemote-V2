# AirRemote backend

The V2 API: Fastify + TypeScript on Postgres (Drizzle ORM). It uses two
workspace packages: `@airremote/contracts` (Zod request/response schemas)
and `@airremote/db` (Drizzle schema and migrations).

## Prerequisites

- Node 24
- pnpm 10 (`corepack enable` or `npm i -g pnpm@10`)
- Docker with Compose

## Run everything in Docker

```bash
cp .env.example .env
docker compose up --build
```

This starts Postgres (`db`), applies migrations once (`migrate`), then starts
the API (`api`) on http://localhost:3000. Check it with
`curl localhost:3000/health`.

## Run the API on the host

```bash
cp .env.example .env        # once
pnpm install
pnpm dev
```

`pnpm dev` (`scripts/dev.ts`) starts Postgres with Docker Compose, applies
pending migrations, then runs the API and restarts it on file changes.
Ctrl+C stops the API, then Postgres.

## Device listener

Devices connect over WebSockets to a second listener on `DEVICE_PORT`
(default `8443`, route `/ws`, subprotocol `airremote.v1`). It uses mutual
TLS: a device needs a client certificate signed by the device CA, whose
Subject CN is its MAC address, and a row in `devices` with that MAC.

It stays off until all three of these are set (the API logs a warning):

| Variable               | File                                     |
| ---------------------- | ---------------------------------------- |
| `DEVICE_TLS_CERT_FILE` | Server certificate devices see (PEM)     |
| `DEVICE_TLS_KEY_FILE`  | Its private key (PEM)                    |
| `DEVICE_TLS_CA_FILE`   | CA that signs device certificates (PEM)  |

- On the host (`pnpm dev`) the values are paths to the files; use absolute
  paths.
- In Docker the files go in `certs/` at the repository root (git-ignored)
  as `device-server.crt`, `device-server.key` and `device-ca.crt`. Compose
  mounts that folder read-only and only checks whether the variables are
  set. The container runs as uid 1000, so the key must be readable by
  uid 1000.

### Dev certificates

`scripts/dev-certs.sh` creates a development CA and server certificate in
`certs/`, under the names Compose expects, and prints the three lines to put
in `.env` for `pnpm dev`. Running it again keeps the CA (so device
certificates stay valid); `--force` replaces it.

`scripts/dev-certs.sh device AA:BB:CC:DD:EE:01` plays the factory: it issues
a device certificate with that MAC as its CN, in `certs/devices/`.

The server certificate names `localhost` and `127.0.0.1`, which is enough for
the simulator and the tests. A real board reaches your machine at its LAN
address, so name that too: `scripts/dev-certs.sh --host 192.168.1.10` (repeat
`--host` for more names). It reissues the server certificate and keeps the
CA; restart `pnpm dev` to pick it up.

## Enrolling a device

A device is allowed on the WebSocket once its owner has enrolled it:

1. The device, already on Wi-Fi, calls `POST /pairing-code` on the device
   listener (same mTLS, no body). It gets `{ pairingCode, expiresAt }`: an
   8-character code valid for 15 minutes. Asking again replaces the code; an
   enrolled device gets `409 DEVICE_ALREADY_REGISTERED`.
2. The device shows the code: the simulator as a QR code, a real board
   over its serial console (`pair`; see `firmware/README.md`).
3. The signed-in owner calls `POST /devices` on the API with
   `{ macAddress, pairingCode, name }`. A wrong, expired or used code is
   `400 INVALID_PAIRING_CODE`.

Codes are stored only as an HMAC keyed with `PAIRING_CODE_SECRET` (at least
32 characters, required; see `.env.example`), so a copy of the database alone
cannot recover them.

To try it without a device, run the mock device: `pnpm device-sim --mac
AA:BB:CC:DD:EE:01` (see `tools/device-sim/README.md`).

## Remotes and learning buttons

All of these need the owner's access token.

1. `POST /devices/:deviceId/remotes` with `{ name, type }` creates a remote
   for one of the owner's devices: `201`.
2. `POST /remotes/:remoteId/buttons` with `{ name }` asks the device to
   listen for an IR code: `202` with `Location: /device-commands/<id>`, or
   `409 DEVICE_OFFLINE` if the device is not connected.
3. `GET /device-commands/:id` returns `{ id, kind, status, createdAt,
   expiresAt, error?, button? }`. Poll it until `status` is not `pending`;
   `succeeded` carries the saved `button`, `failed` an `error`.

Listing and pressing, also with the owner's access token:

- `GET /devices`, `GET /remotes` and `GET /remotes/:remoteId/buttons` list
  the owner's devices, remotes, and the buttons of one remote.
- `POST /buttons/:buttonId/press` (no body) sends the button's saved IR code
  to its device: `202` with `Location: /device-commands/<id>`, or
  `409 DEVICE_OFFLINE`. Poll the command as above; it ends `succeeded`, or
  `failed` with an `error` such as `IR_SEND_FAILED`.

Commands are rows in `device_commands`, so any instance can report them.
With the mock device, type `/press` in it to send a code. The curl commands
that set `$TOKEN`, `$DEVICE_ID`, `$REMOTE` and `$BUTTON` and make these requests are in
`tools/device-sim/README.md`.

## Scripts (from the repository root)

| Script                  | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm dev`              | Starts Postgres, migrates, runs the API in watch mode         |
| `pnpm build`            | Builds the API and the migrate script to `dist/`              |
| `pnpm typecheck`        | Type-checks every package                                     |
| `pnpm lint`             | Runs ESLint                                                   |
| `pnpm format`           | Formats code with Prettier                                    |
| `pnpm test`             | Runs every test: unit, integration and e2e                    |
| `pnpm test:unit`        | Unit tests only (no Docker needed)                            |
| `pnpm test:integration` | Repository and service tests against a real Postgres (Docker) |
| `pnpm test:e2e`         | HTTP tests against the running app and Postgres (Docker)      |
| `pnpm db:generate`      | Generates a migration from the Drizzle schema                 |
| `pnpm db:migrate`       | Applies pending migrations to `DATABASE_URL`                  |
| `pnpm openapi`          | Writes the API's OpenAPI document to `openapi.json`           |

## OpenAPI and Postman

`pnpm openapi` writes `openapi.json` (OpenAPI 3.1, git-ignored) at the
repository root from the routes' Zod schemas; it needs no database or `.env`.
In Postman, choose **Import** and pick the file. Requests that need a signed-in
user use bearer auth: set the collection's token to the `accessToken` from
`POST /auth/login`.

## Adding a table

1. Add a file under `packages/db/src/schema/` and re-export it from
   `packages/db/src/schema/index.ts`.
2. Run `pnpm db:generate --name <what_it_does>`.
3. Put the table's rules in the database (checks, unique indexes, foreign
   keys) and test them in `packages/db/src/schema/__tests__/`.
4. Commit the schema file and the generated migration in
   `packages/db/migrations/`. Hand-edit a migration only to change existing
   data, and test that edit in `packages/db/src/__tests__/migrations.itest.ts`.

The conventions for features, routes and tests are in the root `CLAUDE.md`.
