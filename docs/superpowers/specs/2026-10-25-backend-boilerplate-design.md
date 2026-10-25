# Backend and database boilerplate — design

Date: 2026-10-25 · Branch: `rewrite/backend`

## Intent

AirRemote V2 is rewritten from scratch, backend first. V1 was a serverless
Python backend on AWS (kept in `legacy/backend/` for reference only). V2 is a
long-running TypeScript server that runs locally in Docker for now and stays
cloud-agnostic, because where it will run in the cloud is not decided.

This change lays down the skeleton every future feature is built on: the
workspace, the server, the database package, the shared contracts package, the
Docker setup and the test setup. Features come afterwards, one at a time, from
the owner.

## Goals

- A pnpm workspace with the backend and two shared packages, wired so the
  backend imports both.
- A Fastify server in TypeScript with the agreed `src/` layout, starting
  cleanly and serving a health check.
- Zod validation on everything coming in and going out of a route, with the
  schemas living in a shared contracts package.
- Postgres with Drizzle ORM, the schema and migrations kept in their own
  package, separate from the server code but used by it.
- `docker compose up` brings up Postgres, applies migrations, and starts the
  API.
- Unit tests run with one command, from `__tests__/` folders next to the code.
- The conventions written down in `CLAUDE.md` so agents follow them.

## Non-goals

- **No example or throwaway feature.** The owner was explicit: the skeleton
  only. The first real feature comes in a later change.
- No tables. The schema package exists and the migration pipeline works, but
  it holds no tables yet.
- No authentication, no WebSockets/device connectivity, no OpenAPI/Swagger,
  no CI, no cloud deployment. All later.
- No frontend or firmware changes.

## Anti-goals

- Fat routes. A route that does more than validate, call a service and return
  is wrong even if it works.
- Importing from or copying the structure of `legacy/`.
- Anything tied to a specific cloud provider.

## Decided by the owner

- **Language and framework:** TypeScript, Fastify.
- **Not serverless.** Runs locally first, dockerized.
- **Database:** Postgres with Drizzle ORM.
- **`backend/src/` layout:**
  ```
  src/
    features/
    plugins/
    shared/
    config/
  ```
- **One folder per feature, split by layer**, named after the feature:
  ```
  features/projects/
    projects.routes.ts
    projects.service.ts
    projects.repository.ts
    projects.helpers.ts     (when needed)
    projects.types.ts       (when needed)
    __tests__/
  ```
- **Every folder has a `__tests__/` folder** holding the unit tests for the
  files in that folder. The general testing approach will be defined later by
  the owner.
- **The database schema lives apart from the Fastify server but is used by
  it.** The reason is tidiness only — nothing else (worker, scripts) needs it.
- **Routes are thin.** Zod validates input (params, query, body) and output
  (responses).
- **Contracts are shared**, in a package of their own, so the frontend can
  use the same schemas later.

## Repository layout (Claude's call, agreed in conversation)

```
package.json            root: workspace scripts only
pnpm-workspace.yaml     backend, packages/*
backend/                the Fastify API
packages/contracts/     Zod schemas for requests and responses
packages/db/            Drizzle schema, Drizzle config, migrations
docker-compose.yml
legacy/                 V1, untouched
```

Package names: `@airremote/backend`, `@airremote/contracts`,
`@airremote/db`.

## How the pieces work

### `packages/contracts`
- Depends on Zod only. No Fastify, no Drizzle, no Node-only APIs, so the
  frontend can import it in the browser.
- Organised by feature, one file or folder per feature, mirroring
  `backend/src/features/`. It starts with the health contract only.
- Exports Zod schemas and the TypeScript types inferred from them.

### `packages/db`
- Holds the Drizzle schema (`src/schema/`, one file per table as tables
  arrive, re-exported from an index), `drizzle.config.ts`, and the generated
  SQL migrations folder, which is committed.
- Exports a factory that creates a Drizzle client from a connection string,
  and the schema. It does not read environment variables itself; the backend
  passes the connection string in.
- Provides a migrate script that applies the committed migrations using
  Drizzle's migrator. Migrations are generated with `drizzle-kit generate`
  and never written by hand except for data changes.
- Postgres driver: Claude's call — `postgres` (postgres.js) or `pg`, the
  builder picks one and uses it consistently.

### `backend/`
- **`config/`** — reads environment variables once at startup and validates
  them with Zod (at least `DATABASE_URL`, `PORT`, `HOST`, `LOG_LEVEL`,
  `NODE_ENV`). Invalid or missing values stop the server with a clear
  message. Nothing else in the app reads `process.env`.
- **`plugins/`** — Fastify plugins registered at startup:
  - Zod type provider (`fastify-type-provider-zod` or equivalent) with its
    validator and serializer compilers, so route schemas are the contracts'
    Zod schemas and responses are validated on the way out.
  - Database: creates the Drizzle client from `@airremote/db` with the
    config's `DATABASE_URL`, decorates the instance with it, closes the
    connection on shutdown.
  - Error handler: turns validation errors into a consistent 400 response,
    and unknown errors into a 500 without leaking internals.
- **`shared/`** — code used by more than one feature (error classes, small
  utilities). Starts nearly empty.
- **`features/`** — one folder per feature. The only feature in this change
  is `health/`.
- **App vs. server split:** a `buildApp()` function creates and configures
  the Fastify instance without listening (used by tests via `inject`), and a
  separate entry point listens on the configured host and port and handles
  graceful shutdown on SIGINT/SIGTERM.
- **Layer rules:**
  - routes: declare the schema from contracts, call the service, return its
    result. No logic, no database access.
  - services: business logic. Call repositories. No Fastify request/reply
    objects.
  - repositories: the only layer that talks to Drizzle.
  - helpers/types: pure functions and types local to the feature.
- Logging: Fastify's built-in pino logger, level from config, pretty output
  in development only.

### Health check
- `GET /health` returns `200` with a status body when the server is up and
  the database answers a trivial query, and `503` when the database does not
  answer. Its request/response schemas live in `@airremote/contracts`.
- It follows the full layer pattern (routes → service → repository) so it is
  the reference for the next feature, without being throwaway: it stays.
- Docker uses it as the API container's healthcheck.

## Docker

- `backend/Dockerfile`: multi-stage. Builds the workspace packages the
  backend needs and produces a small runtime image that runs compiled
  JavaScript on Node 24 (the local Node version), as a non-root user.
- `docker-compose.yml` at the root, three services:
  - `db` — Postgres (current major version), data in a named volume, with a
    healthcheck.
  - `migrate` — one-shot: runs the `@airremote/db` migrate script once `db`
    is healthy, then exits.
  - `api` — starts after `migrate` has completed successfully, healthcheck
    on `/health`.
- An `.env.example` documents every variable. Real `.env` files stay
  ignored.
- Local development without the API container is also supported: start only
  `db` with compose, run the API on the host with a watch mode.

## Tooling

- pnpm workspaces, Node 24.
- TypeScript in strict mode, a shared base `tsconfig` at the root that each
  package extends.
- Vitest for tests. Each `__tests__/` folder is picked up automatically.
  This change ships tests for config validation and the health route (via
  `buildApp().inject`, with the database dependency faked) so the setup is
  proven to work.
- ESLint and Prettier with a minimal shared config (Claude's call).
- Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, plus
  `db:generate` and `db:migrate`.
- How workspace packages are compiled for production (per-package `tsc`
  builds vs. bundling the backend) is left to the builder, as long as dev
  runs from source with watch mode and production runs plain compiled JS.

## Documentation

- Update root `CLAUDE.md` with the conventions above: the layout, the layer
  rules, thin routes, contracts in `@airremote/contracts`, schema in
  `@airremote/db`, a `__tests__/` folder in every folder, and that
  repositories are the only Drizzle callers.
- Short `backend/README.md`: how to run it with Docker and on the host, and
  the scripts.

## Settled after review (Claude's calls)

- **First migration:** with no tables, an empty first migration is generated
  with `drizzle-kit generate --custom` so the migrator has a journal to apply
  and `migrate` exits 0.
- **Migrate script config:** "`@airremote/db` does not read env vars" applies
  to the client factory. The standalone migrate script reads `DATABASE_URL`
  itself.
- **Error shape:** one error response schema in `@airremote/contracts`, used
  by the error handler for 400 and 500 responses.
- **Database down at startup:** the API still starts and `/health` returns
  503. Only a missing or invalid `DATABASE_URL` stops startup.
- **Empty `__tests__/` folders** are kept in git with a `.gitkeep`.
- **Docker details:** build context is the repo root with a `.dockerignore`
  excluding `legacy/`; `migrate` runs from the API image with a different
  command; the healthcheck uses Node's built-in `fetch`, not curl.

## Left to the builder

- Exact library versions (current stable at build time).
- Postgres driver choice.
- Package build strategy (see Tooling).
- File names inside `plugins/`, `config/` and `shared/`.
- Exact health response shape, as long as it lives in contracts and is
  validated on the way out.

## Done when

- `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and
  `pnpm build` pass from the root.
- `docker compose up` brings up all three services; `migrate` exits 0;
  `curl localhost:<port>/health` returns 200; stopping `db` makes it return
  503.
- The API refuses to start with a missing or invalid `DATABASE_URL`.
