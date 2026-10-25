# Backend and Database Boilerplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pnpm workspace with a Fastify + TypeScript backend, a Drizzle/Postgres package and a Zod contracts package, serving `GET /health`, runnable with `docker compose up`.

**Architecture:** Three workspace packages. `@airremote/contracts` (Zod only) and `@airremote/db` (Drizzle schema, client factory, migrations) export TypeScript source; `@airremote/backend` imports both, runs from source with `tsx` in dev, and is bundled to plain JS with `tsup` for production. Features use factory functions with explicit dependencies: route → service → repository, and only repositories touch Drizzle.

**Tech Stack:** Node 24, pnpm 10, TypeScript (strict), Fastify 5, Zod 4, `fastify-type-provider-zod` (a version that supports Zod 4), `fastify-plugin`, Drizzle ORM + drizzle-kit, `postgres` (postgres.js), Vitest, ESLint (typescript-eslint flat config) + Prettier, tsup, tsx, Docker Compose, Postgres 18.

**Spec:** `docs/superpowers/specs/2026-10-25-backend-boilerplate-design.md`

## Global Constraints

- Package names: `@airremote/backend`, `@airremote/contracts`, `@airremote/db`. Workspace globs: `backend`, `packages/*`.
- `backend/src/` top-level folders: `features/`, `plugins/`, `shared/`, `config/`.
- Feature files are `<feature>.routes.ts`, `<feature>.service.ts`, `<feature>.repository.ts`, plus `<feature>.helpers.ts` / `<feature>.types.ts` only when needed.
- Every folder that holds source files has a `__tests__/` folder; when it has no tests yet it holds an empty `.gitkeep`. Test files are `*.test.ts`.
- Routes only: declare the contract schema, call the service, return the result. Services never touch request/reply. Only `*.repository.ts` files import `drizzle-orm`.
- `@airremote/contracts` depends on `zod` only — no Node APIs.
- `@airremote/db`'s client factory never reads env vars; the migrate CLI and `drizzle.config.ts` may.
- In the backend, only `src/config/` reads `process.env`.
- No example/throwaway feature, no tables, no auth/WebSockets/Swagger/CI.
- Nothing under `legacy/` is edited, imported or included in tooling.
- All modules are ESM (`"type": "module"`); TS uses `module: "ESNext"`, `moduleResolution: "Bundler"`, so relative imports carry no extension.
- Commit messages follow the repo's style (plain imperative sentence), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Database unreachable when the API boots** → the API still starts and `/health` returns 503 (test in Task 4: real `createDb` against a closed port).
- **Database that accepts but never answers** → `/health` answers 503 within its timeout instead of hanging the Docker healthcheck (test in Task 4: ping that never resolves, fake timers).
- **Malformed JSON body** → 400 in the shared error shape, not Fastify's default shape (test in Task 3).
- **A handler returns data that breaks its response contract** → 500 in the error shape, no internals in the body (test in Task 3).
- **`PORT` set to a non-number, or `DATABASE_URL` not a postgres URL** → startup fails naming the variable (tests in Task 3).

---

### Task 1: Workspace tooling and `@airremote/contracts`

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`, `packages/contracts/src/__tests__/.gitkeep`
- Create: `packages/contracts/src/errors/errors.contract.ts`, `packages/contracts/src/errors/__tests__/.gitkeep`
- Create: `packages/contracts/src/health/health.contract.ts`
- Test: `packages/contracts/src/health/__tests__/health.contract.test.ts`

**Interfaces:**
- Produces (from `@airremote/contracts`):
  - `errorResponseSchema = z.object({ statusCode: z.number().int(), error: z.string(), message: z.string(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() })`, `type ErrorResponse`
  - `healthResponseSchema = z.object({ status: z.enum(['ok', 'unavailable']), database: z.enum(['up', 'down']) })`, `type HealthResponse`
- Produces (root scripts): `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `db:generate`, `db:migrate`

- [ ] **Step 1: Root workspace files**

`package.json`: `private: true`, `"type": "module"`, `"packageManager": "pnpm@10.33.0"`, `"engines": { "node": ">=24" }`. Scripts: `dev` → `pnpm --filter @airremote/backend dev`; `build` → `pnpm -r build`; `typecheck` → `pnpm -r typecheck`; `lint` → `eslint .`; `format` → `prettier --write .`; `test` → `vitest run`; `db:generate` → `pnpm --filter @airremote/db generate`; `db:migrate` → `pnpm --filter @airremote/db migrate`. Dev deps at root: `typescript`, `vitest`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `prettier`, `@types/node`.

`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `target: "ES2023"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`, `noEmit`, `types: ["node"]`.

`vitest.config.ts`: `include: ['backend/src/**/__tests__/**/*.test.ts', 'packages/*/src/**/__tests__/**/*.test.ts']`, `environment: 'node'`.

`eslint.config.js`: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`; global ignores `legacy/**`, `**/dist/**`, `**/node_modules/**`, `packages/db/migrations/**`. Two convention rules, added now so they apply as code lands:
- for `backend/src/**/*.ts` except `backend/src/config/**`: `no-restricted-properties` on `process.env` ("Read configuration through src/config").
- for `backend/src/**/*.ts` except `**/*.repository.ts` and `**/__tests__/**`: `no-restricted-imports` on `drizzle-orm` and `drizzle-orm/*` ("Only repositories talk to Drizzle").

`.prettierrc.json`: `{ "singleQuote": true }`. `.prettierignore`: `legacy/`, `dist/`, `pnpm-lock.yaml`, `packages/db/migrations/`.

- [ ] **Step 2: Contracts package shell**

`packages/contracts/package.json`: name `@airremote/contracts`, `private`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, dependency `zod` (v4), script `typecheck` → `tsc --noEmit -p .`. `tsconfig.json` extends `../../tsconfig.base.json`, `include: ["src"]`.

- [ ] **Step 3: Write the failing test** — `health.contract.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../health.contract';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', database: 'up' })).toEqual({ status: 'ok', database: 'up' });
  });
  it('rejects an unknown status', () => {
    expect(healthResponseSchema.safeParse({ status: 'fine', database: 'up' }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Run it, expect failure**

Run: `pnpm install && pnpm test`
Expected: FAIL — cannot resolve `../health.contract`.

- [ ] **Step 5: Implement both schemas** in `errors.contract.ts` and `health.contract.ts` exactly as in Interfaces, each exporting the inferred type; `src/index.ts` re-exports both files. Add the `.gitkeep` files listed above.

- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 2 tests pass; typecheck and lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json eslint.config.js .prettierrc.json .prettierignore vitest.config.ts packages/contracts
git commit -m "Set up the pnpm workspace and the contracts package"
```

---

### Task 2: `@airremote/db` and the local Postgres

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/tsup.config.ts`
- Create: `packages/db/src/index.ts`, `packages/db/src/client.ts`, `packages/db/src/migrations.ts`, `packages/db/src/migrate.ts`, `packages/db/src/__tests__/.gitkeep`
- Create: `packages/db/src/schema/index.ts`, `packages/db/src/schema/__tests__/.gitkeep`
- Create (generated): `packages/db/migrations/0000_init.sql`, `packages/db/migrations/meta/*`
- Create: `docker-compose.yml` (service `db` only), `.env.example`

**Interfaces:**
- Produces (from `@airremote/db`):
  - `type Database = PostgresJsDatabase<typeof schema>`
  - `interface DbHandle { db: Database; close(): Promise<void> }`
  - `createDb(connectionString: string): DbHandle` — lazy: does not connect until the first query.
  - `runMigrations(connectionString: string, migrationsFolder: string): Promise<void>` — opens its own single-connection client and closes it when done.
  - `schema` namespace (empty for now).
- Produces (CLI): `packages/db/src/migrate.ts` reads `DATABASE_URL` (exit 1 with a message if missing) and `MIGRATIONS_FOLDER` (default: `../migrations` resolved from `import.meta.dirname`), calls `runMigrations`, logs success, exits 0; on error logs it and exits 1.
- Produces (Compose): service `db` on `5432`, credentials from `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (defaults `airremote`/`airremote`/`airremote`), healthcheck `pg_isready`.

- [ ] **Step 1: Package shell**

`package.json`: name `@airremote/db`, `private`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`. Deps `drizzle-orm`, `postgres`; dev deps `drizzle-kit`, `tsup`, `tsx`. Scripts: `generate` → `drizzle-kit generate`; `migrate` → `node --env-file-if-exists=../../.env --import tsx src/migrate.ts`; `build` → `tsup`; `typecheck` → `tsc --noEmit -p .`. `tsconfig.json` includes `src` and `drizzle.config.ts`.

`drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/schema/index.ts'`, `out: './migrations'`.

`tsup.config.ts`: entry `src/migrate.ts`, format `esm`, `outDir: 'dist'`, `noExternal: [/.*/]` (one self-contained file so the Docker image can run it with no `node_modules`).

- [ ] **Step 2: Implement `createDb`, `runMigrations`, the migrate CLI and the empty schema** per Interfaces. Use `drizzle-orm/postgres-js` and its `migrate` from `drizzle-orm/postgres-js/migrator`. `src/schema/index.ts` holds `export {};` and a one-line comment that tables go in one file each, re-exported here.

- [ ] **Step 3: Generate the empty first migration**

Run: `pnpm --filter @airremote/db exec drizzle-kit generate --custom --name init`
Expected: `migrations/0000_init.sql` (empty apart from drizzle-kit's comment) and `migrations/meta/_journal.json` exist.

- [ ] **Step 4: Compose `db` service and `.env.example`**

`docker-compose.yml`: service `db`, image `postgres:18-alpine`, env from `POSTGRES_*` with the defaults above, port `5432:5432`, named volume `pgdata` mounted at `/var/lib/postgresql` (Postgres 18 images use this path), healthcheck `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` every 5s.

`.env.example` documents: `POSTGRES_USER=airremote`, `POSTGRES_PASSWORD=airremote`, `POSTGRES_DB=airremote`, `DATABASE_URL=postgres://airremote:airremote@localhost:5432/airremote`, `HOST=0.0.0.0`, `PORT=3000`, `LOG_LEVEL=info`, `NODE_ENV=development`, `MIGRATIONS_FOLDER=` (blank = default), each with a one-line comment.

- [ ] **Step 5: Verify migrations against a real database**

Run: `cp .env.example .env && docker compose up -d --wait db && pnpm db:migrate && pnpm db:migrate`
Expected: both runs exit 0 (the second applies nothing). `docker compose exec db psql -U airremote -c 'select count(*) from drizzle.__drizzle_migrations'` → `1`.

Run: `DATABASE_URL= pnpm --filter @airremote/db exec tsx src/migrate.ts; echo $?`
Expected: a message naming `DATABASE_URL`, exit code `1`.

- [ ] **Step 6: Verify build and checks**

Run: `pnpm --filter @airremote/db build && pnpm typecheck && pnpm lint && pnpm db:generate`
Expected: `packages/db/dist/migrate.js` exists; checks exit 0; `db:generate` reports no schema changes.

- [ ] **Step 7: Commit**

```bash
git add packages/db docker-compose.yml .env.example pnpm-lock.yaml
git commit -m "Add the db package with Drizzle, migrations and a local Postgres"
```

---

### Task 3: Backend skeleton — config, app, plugins, error handling

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`
- Create: `backend/src/app.ts`, `backend/src/server.ts`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/plugins/zod.ts`, `backend/src/plugins/db.ts`, `backend/src/plugins/error-handler.ts`
- Create: `backend/src/shared/errors.ts`, `backend/src/shared/__tests__/.gitkeep`
- Create: `backend/src/__tests__/test-utils.ts`
- Test: `backend/src/config/__tests__/env.test.ts`, `backend/src/plugins/__tests__/error-handler.test.ts`

**Interfaces:**
- Consumes: `createDb`, `DbHandle`, `Database` from `@airremote/db`; `errorResponseSchema`, `ErrorResponse` from `@airremote/contracts`.
- Produces:
  - `config/env.ts`: `envSchema`; `type Env = { NODE_ENV: 'development' | 'production' | 'test'; LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'; HOST: string; PORT: number; DATABASE_URL: string }`; `class ConfigError extends Error`; `loadEnv(source: Record<string, string | undefined> = process.env): Env` — throws `ConfigError` whose message lists every invalid variable by name. Defaults: `NODE_ENV` `development`, `LOG_LEVEL` `info`, `HOST` `0.0.0.0`, `PORT` `3000` (coerced from string, integer 0–65535). `DATABASE_URL` required, must be a URL with protocol `postgres:` or `postgresql:`.
  - `app.ts`: `buildApp(options: { env: Env; db?: DbHandle }): Promise<FastifyInstance>` — registers, in order, `zodPlugin`, `errorHandlerPlugin`, `dbPlugin` (with `options.db ?? createDb(env.DATABASE_URL)`), then feature routes. Logger: `level: env.LOG_LEVEL`, `pino-pretty` transport only when `NODE_ENV === 'development'`. Does not call `listen`.
  - `server.ts`: `loadEnv()` (on `ConfigError`: print its message, exit 1) → `buildApp` → `listen({ host, port })`; on `SIGINT`/`SIGTERM` → `app.close()` then exit 0.
  - `plugins/zod.ts`: `zodPlugin` (via `fastify-plugin`) sets the provider's `validatorCompiler` and `serializerCompiler`.
  - `plugins/db.ts`: `dbPlugin` (via `fastify-plugin`), options `{ handle: DbHandle }`, decorates `fastify.db: Database` (with a `declare module 'fastify'` augmentation) and closes the handle in `onClose`.
  - `plugins/error-handler.ts`: `errorHandlerPlugin` (via `fastify-plugin`) sets the error handler and not-found handler; every error response matches `errorResponseSchema`, with `error` = `http.STATUS_CODES[statusCode]`:
    - schema validation error (`hasZodFastifySchemaValidationErrors`) → 400, `message: 'Request validation failed'`, `details` = one `{ path, message }` per issue (path from `instancePath`).
    - `AppError` or any error with `statusCode` 400–499 → that status, its own message.
    - anything else (including response serialization errors) → log the error, 500, `message: 'An unexpected error occurred'`.
    - unknown route → 404, `message: 'Route <METHOD> <url> not found'`.
  - `shared/errors.ts`: `class AppError extends Error { constructor(public readonly statusCode: number, message: string) }`.
  - `__tests__/test-utils.ts`: `testEnv: Env` (`NODE_ENV: 'test'`, `LOG_LEVEL: 'silent'`, `HOST: '127.0.0.1'`, `PORT: 0`, `DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test'`); `fakeDb(execute: () => Promise<unknown>): DbHandle` returning `{ db: { execute } as unknown as Database, close: async () => {} }`.

- [ ] **Step 1: Package shell**

`backend/package.json`: name `@airremote/backend`, `private`, `"type": "module"`, `"files": ["dist"]`. Deps: `fastify`, `fastify-plugin`, `fastify-type-provider-zod`, `zod`, `@airremote/contracts` and `@airremote/db` (`workspace:*`), plus `drizzle-orm` and `postgres` (needed at runtime because the bundle keeps third-party code external). Dev deps: `tsx`, `tsup`, `pino-pretty`. Scripts: `dev` → `node --env-file-if-exists=../.env --watch --import tsx src/server.ts`; `typecheck` → `tsc --noEmit -p .` (`build`/`start` come in Task 5). `tsconfig.json` extends the base, `include: ["src"]`.

- [ ] **Step 2: Write the failing env tests** — `env.test.ts`

```ts
const valid = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

it('applies defaults', () => {
  expect(loadEnv(valid)).toEqual({ ...valid, NODE_ENV: 'development', LOG_LEVEL: 'info', HOST: '0.0.0.0', PORT: 3000 });
});
it('coerces PORT from a string', () => {
  expect(loadEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
});
it('rejects a missing DATABASE_URL', () => {
  expect(() => loadEnv({})).toThrow(ConfigError);
  expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
});
it('rejects a non-postgres DATABASE_URL', () => {
  expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(/DATABASE_URL/);
});
it('rejects a non-numeric PORT', () => {
  expect(() => loadEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
});
it('names every invalid variable at once', () => {
  expect(() => loadEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(/DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/);
});
```

- [ ] **Step 3: Write the failing error-handler tests** — `error-handler.test.ts`

Each test builds `buildApp({ env: testEnv, db: fakeDb(async () => []) })`, adds a test-only route with `app.withTypeProvider<ZodTypeProvider>()` where needed, and uses `app.inject`. Every response body must pass `errorResponseSchema.parse`.

```ts
it('returns 400 with details for an invalid body', async () => {
  // POST /echo with body schema z.object({ name: z.string() }), payload { name: 1 }
  expect(res.statusCode).toBe(400);
  expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Request validation failed' });
  expect(body.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining('name') })]));
});
it('returns 400 in the error shape for malformed JSON', async () => {
  // POST /echo, content-type application/json, payload '{"name":'
  expect(res.statusCode).toBe(400);
  expect(body.error).toBe('Bad Request');
});
it('passes through an AppError status and message', async () => {
  // GET /teapot throws new AppError(409, 'Already exists')
  expect(body).toEqual({ statusCode: 409, error: 'Conflict', message: 'Already exists' });
});
it('hides internals of unexpected errors', async () => {
  // GET /boom throws new Error('secret detail')
  expect(res.statusCode).toBe(500);
  expect(body.message).toBe('An unexpected error occurred');
  expect(res.body).not.toContain('secret detail');
});
it('returns 500 when a response breaks its contract', async () => {
  // GET /bad with response { 200: z.object({ ok: z.boolean() }) } returning { ok: 'yes' }
  expect(res.statusCode).toBe(500);
  expect(body.message).toBe('An unexpected error occurred');
});
it('returns 404 in the error shape for unknown routes', async () => {
  // GET /nope
  expect(body).toEqual({ statusCode: 404, error: 'Not Found', message: 'Route GET /nope not found' });
});
```

- [ ] **Step 4: Run them, expect failure**

Run: `pnpm install && pnpm test`
Expected: FAIL — modules under `backend/src` not found.

- [ ] **Step 5: Implement** `config/env.ts`, `shared/errors.ts`, the three plugins, `app.ts`, `server.ts` and `__tests__/test-utils.ts` per Interfaces. `buildApp` registers no feature routes yet.

- [ ] **Step 6: Verify tests and checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all tests pass; checks exit 0.

- [ ] **Step 7: Verify startup behaviour on the host**

Run: `pnpm dev` (with `.env` from Task 2, `db` up)
Expected: pretty log line "Server listening at http://0.0.0.0:3000"; `curl -s localhost:3000/nope` → the 404 error body. Ctrl-C exits cleanly.

Run: `DATABASE_URL=nope pnpm --filter @airremote/backend exec tsx src/server.ts; echo $?`
Expected: message naming `DATABASE_URL`, exit code `1`.

- [ ] **Step 8: Commit**

```bash
git add backend pnpm-lock.yaml
git commit -m "Add the Fastify backend skeleton with config, plugins and error handling"
```

---

### Task 4: Health feature and the written conventions

**Files:**
- Create: `backend/src/features/health/health.repository.ts`, `health.service.ts`, `health.routes.ts`
- Modify: `backend/src/app.ts` (register `healthRoutes`)
- Modify: `CLAUDE.md`
- Test: `backend/src/features/health/__tests__/health.service.test.ts`, `backend/src/features/health/__tests__/health.routes.test.ts`

**Interfaces:**
- Consumes: `Database`, `createDb` from `@airremote/db`; `healthResponseSchema`, `HealthResponse` from `@airremote/contracts`; `buildApp`, `testEnv`, `fakeDb` from Task 3.
- Produces — the reference pattern for every later feature:
  - `createHealthRepository(db: Database): HealthRepository`, `type HealthRepository = { pingDatabase(): Promise<void> }` — runs ``db.execute(sql`select 1`)``.
  - `createHealthService(deps: { repository: HealthRepository; timeoutMs?: number }): HealthService`, `type HealthService = { check(): Promise<HealthResponse> }` — `timeoutMs` default `2000`. Ping resolves in time → `{ status: 'ok', database: 'up' }`; rejects or times out → `{ status: 'unavailable', database: 'down' }`. Never throws.
  - `healthRoutes: FastifyPluginAsyncZod` — `GET /health`, `schema.response` `{ 200: healthResponseSchema, 503: healthResponseSchema }`; builds repository and service from `fastify.db`, replies `200` when `status === 'ok'`, else `503`.

- [ ] **Step 1: Write the failing service tests** — `health.service.test.ts`

```ts
it('reports up when the ping resolves', async () => {
  const service = createHealthService({ repository: { pingDatabase: async () => {} } });
  expect(await service.check()).toEqual({ status: 'ok', database: 'up' });
});
it('reports down when the ping rejects', async () => {
  const service = createHealthService({ repository: { pingDatabase: async () => { throw new Error('refused'); } } });
  expect(await service.check()).toEqual({ status: 'unavailable', database: 'down' });
});
it('reports down when the ping never answers', async () => {
  vi.useFakeTimers();
  const service = createHealthService({ repository: { pingDatabase: () => new Promise(() => {}) }, timeoutMs: 2000 });
  const result = service.check();
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toEqual({ status: 'unavailable', database: 'down' });
  vi.useRealTimers();
});
```

- [ ] **Step 2: Write the failing route tests** — `health.routes.test.ts`

```ts
it('returns 200 when the database answers', async () => {
  const app = await buildApp({ env: testEnv, db: fakeDb(async () => [{ '?column?': 1 }]) });
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok', database: 'up' });
});
it('returns 503 when the database errors', async () => {
  // fakeDb(async () => { throw new Error('down'); })
  expect(res.statusCode).toBe(503);
  expect(res.json()).toEqual({ status: 'unavailable', database: 'down' });
});
it('starts and returns 503 when the database is unreachable', async () => {
  const app = await buildApp({ env: testEnv, db: createDb('postgres://u:p@127.0.0.1:1/none') });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(503);
  await app.close();
});
```

- [ ] **Step 3: Run them, expect failure**

Run: `pnpm test`
Expected: FAIL — health modules not found.

- [ ] **Step 4: Implement** the repository, service (race the ping against a `timeoutMs` timer and clear the timer afterwards) and routes per Interfaces; register `healthRoutes` in `buildApp`.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass. With `db` up and `pnpm dev` running: `curl -i localhost:3000/health` → `200 {"status":"ok","database":"up"}`; after `docker compose stop db` → `503 {"status":"unavailable","database":"down"}`; `docker compose start db` afterwards.

- [ ] **Step 6: Write the conventions into `CLAUDE.md`**

Keep the existing `legacy/` section. Add a "Backend conventions" section stating, briefly: the workspace layout (`backend/`, `packages/contracts`, `packages/db`); the four `src/` folders and what goes in each; the feature file naming; the layer rules (routes thin, services no request/reply, only repositories import `drizzle-orm` — enforced by ESLint); dependencies passed through `create*` factories as in `features/health`; contracts live in `@airremote/contracts` and are used as route `schema` for input and output; tables go in `packages/db/src/schema/`, one file each, migrations generated with `pnpm db:generate` and committed; only `src/config` reads `process.env`; every folder holding source files has a `__tests__/` folder (`.gitkeep` until it has tests) — the general testing approach is still to be defined by the owner.

- [ ] **Step 7: Commit**

```bash
git add backend CLAUDE.md
git commit -m "Add the health check and write down the backend conventions"
```

---

### Task 5: Docker image, full compose stack and README

**Files:**
- Create: `backend/Dockerfile`, `.dockerignore`, `backend/tsup.config.ts`, `backend/README.md`
- Modify: `backend/package.json` (scripts `build`, `start`), `docker-compose.yml` (services `migrate`, `api`)

**Interfaces:**
- Consumes: `packages/db` `build` → `dist/migrate.js` (Task 2); `backend/src/server.ts` (Task 3).
- Produces: image layout `/app/backend` (deployed backend: `package.json`, `dist/server.js`, prod `node_modules`), `/app/db/dist/migrate.js`, `/app/db/migrations/`. Commands: API `node backend/dist/server.js`; migrate `node db/dist/migrate.js`.

- [ ] **Step 1: Backend build**

`backend/tsup.config.ts`: entry `src/server.ts`, format `esm`, `outDir: 'dist'`, `noExternal: [/^@airremote\//]` (workspace packages are inlined; third-party packages stay external). Scripts: `build` → `tsup`; `start` → `node dist/server.js`.

Run: `pnpm build && node --env-file=.env backend/dist/server.js`
Expected: builds both packages; server starts and `curl localhost:3000/health` → 200. Stop it.

- [ ] **Step 2: Dockerfile and `.dockerignore`**

`.dockerignore`: `legacy`, `**/node_modules`, `**/dist`, `.git`, `.idea`, `.env`, `docs`.

`backend/Dockerfile` (build context = repo root), multi-stage on `node:24-slim`:
- **build**: install pnpm `10.33.0`; copy the workspace manifests and lockfile first, `pnpm install --frozen-lockfile`; copy `tsconfig.base.json`, `backend/`, `packages/`; `pnpm --filter @airremote/db --filter @airremote/backend build`; `pnpm --filter @airremote/backend deploy --prod --legacy /out/backend`.
- **runtime**: `WORKDIR /app`, `ENV NODE_ENV=production`; copy `/out/backend` → `/app/backend`, `packages/db/dist` → `/app/db/dist`, `packages/db/migrations` → `/app/db/migrations`; `USER node`; `EXPOSE 3000`; `CMD ["node", "backend/dist/server.js"]`.

- [ ] **Step 3: Compose `migrate` and `api`**

Both `build: { context: ., dockerfile: backend/Dockerfile }`, image `airremote-backend`, with `DATABASE_URL: postgres://${POSTGRES_USER:-airremote}:${POSTGRES_PASSWORD:-airremote}@db:5432/${POSTGRES_DB:-airremote}`.
- `migrate`: `command: ["node", "db/dist/migrate.js"]`, `depends_on: { db: { condition: service_healthy } }`, `restart: "no"`.
- `api`: `depends_on: { migrate: { condition: service_completed_successfully } }`, environment `HOST: 0.0.0.0`, `PORT: 3000`, `LOG_LEVEL: ${LOG_LEVEL:-info}`, `NODE_ENV: production`; ports `${PORT:-3000}:3000`; healthcheck `["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]`, interval 10s, retries 3.

- [ ] **Step 4: Verify the spec's "done when"**

Run: `docker compose down && docker compose up -d --build --wait`
Expected: `db` and `api` healthy; `docker compose ps -a migrate` shows `Exited (0)`.

Run: `curl -i localhost:3000/health` → `200`. `docker compose stop db && curl -i localhost:3000/health` → `503` (within ~2s). `docker compose start db`.

Run: `time docker compose stop api` → stops in well under the 10s kill timeout; `docker compose logs api` shows a clean shutdown, no stack trace.

Run: `docker compose run --rm -e DATABASE_URL=nope api; echo $?` → message naming `DATABASE_URL`, non-zero exit.

- [ ] **Step 5: `backend/README.md`**

Short: prerequisites (Node 24, pnpm 10, Docker); run everything with `cp .env.example .env && docker compose up --build`; run on the host with `docker compose up -d db && pnpm db:migrate && pnpm dev`; the root scripts and what each does; adding a table = add a schema file → `pnpm db:generate` → commit the migration.

- [ ] **Step 6: Final checks**

Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all exit 0. `git status` shows no stray files (no `dist/`, no `.env`).

- [ ] **Step 7: Commit**

```bash
git add backend .dockerignore docker-compose.yml pnpm-lock.yaml
git commit -m "Dockerize the backend with migrate and api services"
```
