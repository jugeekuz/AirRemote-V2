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
docker compose up -d db     # Postgres only
pnpm db:migrate
pnpm dev                    # restarts on file changes
```

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

## Scripts (from the repository root)

| Script                  | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm dev`              | Runs the API from source with watch mode                      |
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

## Adding a table

1. Add a file under `packages/db/src/schema/` and re-export it from
   `packages/db/src/schema/index.ts`.
2. Run `pnpm db:generate`.
3. Commit the schema file and the generated migration in
   `packages/db/migrations/`.

The conventions for features, routes and tests are in the root `CLAUDE.md`.
