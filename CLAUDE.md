# AirRemote V2

AirRemote V2 is being rewritten from scratch, one component at a time:
`backend/` first, then `firmware/`, then `frontend/`.

## V1 is at the `v1-final` tag

The original V1 code (`frontend/`, `backend/`, `firmware/`) is only in git, at
the tag `v1-final`. Look up how V1 did something with
`git show v1-final:frontend/src/pages/Login.jsx` or
`git ls-tree -r --name-only v1-final frontend/src`.

- Never check V1 files out into the working tree, and never import, copy or
  build from them; new code must stand on its own.
- Don't copy its patterns, structure or dependencies by default. V2 changes the
  infrastructure, structure and language on purpose; take behaviour and domain
  knowledge from V1, not its implementation.

## Backend conventions

The workspace (pnpm) holds `backend/` (`@airremote/backend`, the Fastify
API), `frontend/` (`@airremote/frontend`, the Expo app; see "Frontend
conventions"), `packages/contracts` (`@airremote/contracts`, Zod schemas
shared with the frontend), `packages/db` (`@airremote/db`, Drizzle schema and
migrations) and `tools/device-sim` (`@airremote/device-sim`, an interactive
mock device for local development; see its README). See `backend/README.md`
for commands. `scripts/dev-certs.sh` creates the device listener's dev
certificates.

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
  `shared/device-connections.ts`, which validates them first. HTTP routes
  served on the device listener go in `<feature>.device-routes.ts`.
- **Device commands** (e.g. learning a button) live in Postgres
  (`device_commands`), so any instance can settle and report them; only
  `DeviceConnections` (online check and send) is in-process.
- **Protected routes** add `{ onRequest: app.authenticate }` and read the
  signed-in user with `authenticatedUserId(request)` from
  `plugins/authenticate.ts`; without a valid access token they answer 401.
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
  A command to a device carries a `commandId`, and the device answers it
  with exactly one reply echoing that id: its result (e.g. `readIrResult`)
  or an `error` with a `code`. There is no separate acknowledgment.
- Tables live in `packages/db/src/schema/`, one file each, re-exported from
  its `index.ts`. Generate migrations with `pnpm db:generate` and commit
  them; never hand-write them except for data changes.

## Testing

Vitest, with three projects in the root `vitest.config.ts`. `pnpm test` runs
all of them; `pnpm test:unit`, `pnpm test:integration` and `pnpm test:e2e`
run one. Integration and e2e tests need Docker, or an existing Postgres
server named by `TEST_DATABASE_URL` (see `backend/README.md`).

- **Unit — `*.test.ts`** in the `__tests__/` folder next to the code. Pure
  functions and mocks only: no database, network or other external service.
  Services are tested with fake repositories; routes with a fake service via
  `buildTestApp()`.
- **Integration — `*.itest.ts`** in the same `__tests__/` folders, for
  `*.repository.ts` and `*.service.ts`. They run against a real Postgres
  started by Testcontainers. Call `useTestDatabase()` from
  `src/__tests__/test-db.ts` at the top of the file: it gives the file its own
  migrated database and empties it before every test. Database rules (checks,
  unique indexes, cascades) are tested the same way in
  `packages/db/src/schema/__tests__/`, and a migration that changes existing
  data gets a test in `packages/db/src/__tests__/migrations.itest.ts`.
- **E2E — `backend/e2e/*.e2e.ts`.** The real app (`buildApp()` on a random
  port) against a real database, called over HTTP with `fetch`. Call
  `useTestApp()` from `e2e/support/test-app.ts` for the base URL and `db`.
  Device tests call `useDeviceServer()` from `e2e/support/device-server.ts`,
  which starts the device server over real mTLS (`{ api: true }` also runs
  the API on the same database); throwaway certificates are
  generated once per run with `openssl` and never committed. Only external
  services (none yet) may be mocked.

Outside `frontend/`, every folder that holds source files has a
`__tests__/` folder (an empty `.gitkeep` until it has tests); the frontend
keeps tests next to the file. One Postgres container is started per run
and migrated once; each test file gets a clone of it, so files run in
parallel without sharing data.

## Firmware conventions

`firmware/` is an ESP-IDF project in C++ for the FireBeetle ESP32. Every
command runs through `firmware/scripts/idf.sh`, which runs ESP-IDF in a
pinned Docker image; nothing ESP-IDF-related is installed on the host. See
`firmware/README.md` for commands.

- `components/core` is platform-free logic: no ESP-IDF, FreeRTOS or hardware
  header (cJSON is allowed). Its `REQUIRES` lists nothing hardware-related,
  and since ESP-IDF exposes its common components to every component anyway,
  `scripts/test.sh` rejects those includes too. `core::Device` makes every
  decision and drives the interfaces in `core/ports.hpp`.
- The other components carry out what `Device` asks: `runtime` (the event
  queue every callback goes through, so `Device` runs on one task; timers;
  the console reader) and `connection` (WebSocket and pairing over mTLS)
  build for esp32 and linux; `board` is ESP32 only. `main/` wires them for
  the board, `linux/` for a Linux program with stand-ins.
- C++ without exceptions or RTTI (ESP-IDF's defaults). Hardware interfaces
  are small abstract classes; test fakes are subclasses of them.
- Tests: each component with tests has a `host_test/` app next to it, built
  for the `linux` target with Unity; `scripts/test.sh` runs them all.
  `firmware/e2e/*.e2e.ts` runs `linux/` against the real device listener
  (`pnpm test:firmware`, part of `pnpm test`, not of `pnpm test:e2e`).
  Wokwi simulation and a manual hardware checklist come later.
- `partitions.csv`, `CONFIG_PARTITION_TABLE_OFFSET` and the bootloader
  settings are fixed once boards exist: changing them means reflashing every
  board over USB.
- A device's key and certificate live in their own `identity` partition,
  apart from `nvs`, so a factory reset and app flashes keep them. Only
  `scripts/provision-device.sh` writes it, and it deletes the key from the
  computer afterwards.
- Never burn eFuses on development boards: no secure boot or flash
  encryption until boards go to other people.
- The firmware version is `firmware/version.txt`, bumped by hand.

## Frontend conventions

`frontend/` is an Expo app for Android, iOS and web, run as development
builds (not Expo Go); `android/` and `ios/` are generated by
`expo prebuild` and not committed. See `frontend/README.md` for commands.
The details are in `frontend/ARCHITECTURE.md`; the recipes are in the
`frontend-*` skills.

- `src/` is split into layers (`app`, `navigation`, `screens`,
  `components`, `hooks`, `contexts`, `stores`, `queries`, `helpers`, `api`,
  `adapters`, `utils`, `config`), and `modules/<feature>/` repeats them for
  one feature. Dependencies flow downward. ESLint enforces the imports
  (`frontend/eslint/layer-boundaries.mjs`): no `../`; modules never import
  other modules; shared layers never import `@modules` (`src/app` and
  `src/navigation` may); only `src/api` imports `axios`; only
  `src/adapters` imports MMKV; only `src/config` reads `process.env`; app
  code imports the UI kit from `@ui` only.
- Server state lives in TanStack Query (`src/queries`, one folder per
  backend domain), client state in Zustand stores. Never copy server data
  into a store or a context; keep ids there and query by them.
- The http client (`src/api/http-client.ts`) validates every response with
  a schema from `@airremote/contracts`, which any layer may import, and
  refreshes the access token on a 401.
- Errors are shown by code from i18n (`messages:errors.<CODE>`); every
  error code needs its text, or the app does not compile. The server's
  `message` is never shown.
- The UI kit is HeroUI Native, vendored in `src/ui/heroui/`; record every
  change to it in its `VENDOR.md`. Style with Tailwind classes (Uniwind)
  and the theme's tokens.
- Tests are Jest, next to the file (`<name>.test.ts(x)`), unlike the
  `__tests__/` folders elsewhere. `pnpm test:frontend` runs them; `pnpm test`
  and `pnpm test:unit` include them.
- `pnpm --filter @airremote/frontend create-new <kind> <name>` scaffolds a
  component, screen, hook, store, domain, helper or module.
