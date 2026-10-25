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
- Dependencies are passed in through `create*` factories, e.g.
  `createHealthService({ repository })`. `features/health` is the reference
  for a new feature.

Contracts and data:

- Request and response schemas live in `@airremote/contracts`, in a folder
  per feature, and are used as the route `schema` so input and output are
  both validated. Errors use `errorResponseSchema`.
- Tables live in `packages/db/src/schema/`, one file each, re-exported from
  its `index.ts`. Generate migrations with `pnpm db:generate` and commit
  them; never hand-write them except for data changes.

Tests: every folder that holds source files has a `__tests__/` folder with
the unit tests for that folder (an empty `.gitkeep` until it has some). Test
files are `*.test.ts`. The general testing approach is still to be defined
by the owner.
