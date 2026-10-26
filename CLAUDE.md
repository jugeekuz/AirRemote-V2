# AirRemote V2

AirRemote V2 is being rewritten from scratch, one component at a time:
`backend/` first, then `firmware/`, then `frontend/`.

## `legacy/` is read-only reference

`legacy/` holds the original V1 code (also tagged `v1-final`). It is there
only so you can look up how V1 did something.

- Never edit anything under `legacy/`.
- Never import, link, symlink or build from `legacy/`; new code must stand on
  its own.
- Don't copy its patterns, structure or dependencies by default. V2 changes the
  infrastructure, structure and language on purpose; take behaviour and domain
  knowledge from V1, not its implementation.
- Keep `legacy/` out of new tooling: workspaces, tsconfig/linter globs, CI
  paths and Docker build contexts.

When a V2 component replaces its V1 counterpart, its `legacy/<component>`
folder is deleted in its own commit.

## Backend conventions

The workspace (pnpm) holds `backend/` (`@airremote/backend`, the Fastify
API), `packages/contracts` (`@airremote/contracts`, Zod schemas shared with
the frontend) and `packages/db` (`@airremote/db`, Drizzle schema and
migrations). See `backend/README.md` for commands.

`backend/src/` has four folders:

- `features/` — one folder per feature, files named after it:
  `<feature>.routes.ts`, `<feature>.service.ts`, `<feature>.repository.ts`,
  plus `<feature>.helpers.ts` / `<feature>.types.ts` only when needed.
- `plugins/` — Fastify plugins registered in `app.ts`.
- `shared/` — code used by more than one feature.
- `config/` — environment validation. Only `src/config` reads `process.env`
  (ESLint enforces it).

Layer rules:

- **Routes are thin:** declare the schema, call the service, return the
  result. No logic, no database access.
- **Services** hold business logic and never see request/reply objects.
- **Repositories** are the only files that import `drizzle-orm` (ESLint
  enforces it).
- **Device sockets:** devices talk to the backend over WebSockets on a
  separate mTLS listener (`src/device-server.ts`). Only
  `plugins/device-gateway.ts` imports `ws` or `@fastify/websocket` (ESLint
  enforces it). A feature handles device messages in
  `<feature>.socket.ts`, thin like routes: it only calls the service.
  Messages to a device go through `DeviceConnections.send` from
  `shared/device-connections.ts`, which validates them first.
- Dependencies are passed in through `create*` factories, e.g.
  `createHealthService({ repository })`. A route plugin builds its service
  from `app.db` unless a `service` option is passed; route tests pass a fake
  one to `buildTestApp()` from `src/__tests__/test-utils.ts`.
  `features/users` is the reference for a new feature.

Contracts and data:

- Request and response schemas live in `@airremote/contracts`, in a folder
  per feature, and are used as the route `schema` so input and output are
  both validated.
- Every error response is the envelope `{ error: { code, message, details? } }`
  (`errorResponseSchema`). Codes are the fixed list in `errorCodeSchema`; add
  a code there before using it. Throw `new AppError(status, code, message)`
  for expected failures; anything else becomes a 500 `INTERNAL_ERROR`.
- Device messages live in `@airremote/contracts` under `device-protocol/`:
  `deviceMessageSchema` (device → server) and `serverMessageSchema`
  (server → device). Add a member there before sending or handling a new
  message type; every frame is validated against them in both directions.
- Tables live in `packages/db/src/schema/`, one file each, re-exported from
  its `index.ts`. Generate migrations with `pnpm db:generate` and commit
  them; never hand-write them except for data changes.

## Testing

Vitest, with three projects in the root `vitest.config.ts`. `pnpm test` runs
all of them; `pnpm test:unit`, `pnpm test:integration` and `pnpm test:e2e`
run one. Integration and e2e tests need Docker.

- **Unit — `*.test.ts`** in the `__tests__/` folder next to the code. Pure
  functions and mocks only: no database, network or other external service.
  Services are tested with fake repositories; routes with a fake service via
  `buildTestApp()`.
- **Integration — `*.itest.ts`** in the same `__tests__/` folders, for
  `*.repository.ts` and `*.service.ts`. They run against a real Postgres
  started by Testcontainers. Call `useTestDatabase()` from
  `src/__tests__/test-db.ts` at the top of the file: it gives the file its own
  migrated database and empties it before every test.
- **E2E — `backend/e2e/*.e2e.ts`.** The real app (`buildApp()` on a random
  port) against a real database, called over HTTP with `fetch`. Call
  `useTestApp()` from `e2e/support/test-app.ts` for the base URL. Device
  tests call `useDeviceServer()` from `e2e/support/device-server.ts`, which
  starts the device server over real mTLS; throwaway certificates are
  generated once per run with `openssl` and never committed. Only external
  services (none yet) may be mocked.

Every folder that holds source files has a `__tests__/` folder (an empty
`.gitkeep` until it has tests). One Postgres container is started per run
and migrated once; each test file gets a clone of it, so files run in
parallel without sharing data.
