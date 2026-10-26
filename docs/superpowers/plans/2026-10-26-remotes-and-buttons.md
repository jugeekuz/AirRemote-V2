# IR Remotes and Buttons Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remotes gain a required type from a fixed list and a checked name unique within their device; a new `buttons` table stores each button's name and raw IR timings, with every rule enforced by Postgres.

**Architecture:** The list of remote types lives in `@airremote/contracts` (zod only, shared with the frontend) and `@airremote/db` imports it for its `pgEnum`. All rules are database constraints (enum, checks, expression unique indexes, foreign keys), declared in the Drizzle schema and generated into one migration, whose only hand edit backfills `type` on existing rows. Integration tests prove each rule against a real Postgres.

**Tech Stack:** Postgres 18, Drizzle ORM 0.45 + drizzle-kit, Zod 4, Vitest (integration project with Testcontainers).

**Spec:** `docs/superpowers/specs/2026-10-26-remotes-and-buttons-design.md`

## Global Constraints

- Follow `CLAUDE.md`. Scope is the data model: no endpoints, services, repositories, device messages or firmware.
- Remote types (exact, in order): `air_conditioner`, `audio_system`, `dehumidifier`, `heater`, `rgb_lights`, `smart_tv`, `generic_device`. Enum name `remote_type`, column `remotes.type`, required, no default.
- Names (remotes and buttons): 1–100 characters, no leading or trailing whitespace, any characters; unique within the parent ignoring case.
- `buttons.timings_us`: `integer[]`, required, one-dimensional, 1–2048 entries, no `NULL` entries, each 0–65535.
- Constraint and index names (exact): `remotes_device_id_name_key`, `remotes_name_check`, `buttons_remote_id_name_key`, `buttons_name_check`, `buttons_timings_us_shape_check`, `buttons_timings_us_range_check`. `remotes_device_id_idx` is dropped.
- Foreign keys cascade: device → remotes → buttons.
- Migration: generated with `pnpm db:generate --name remotes_and_buttons`; the only hand edit adds `type` as nullable, backfills `generic_device`, then sets it `NOT NULL`.
- Commit messages: plain imperative sentence, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line. Before each commit: `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --check .` each clean, run on their own (not piped).

## Review Focus

1. **Whitespace beyond spaces:** a name with a leading tab or trailing newline is rejected (not only `' '`), since `btrim` alone strips only spaces. → Task 2 itest "rejects names with leading or trailing whitespace" includes `'\tPower'` and `'Power\n'`.
2. **Uniqueness ignoring case across real text:** `Σαλόνι` and `σαλόνι` collide like `Living room`/`living room` (Postgres `lower()` handles Unicode). → Task 2 itest "rejects the same name in another case" includes a Greek pair.
3. **Arrays Postgres treats specially:** an empty array has no dimensions (`array_ndims` is `NULL`, which a check alone would let through), and a `NULL` entry makes `ALL(...)` comparisons `NULL`. Both must be rejected. → Task 2 itests for `'{}'` and `ARRAY[1, NULL]`.
4. **The migration on a non-empty database:** an existing remote ends up `generic_device` and the migration does not fail. → Task 3 itest "backfills type on existing remotes".
5. **The Docker image still builds and migrates:** `@airremote/db` now imports `@airremote/contracts`, and the image's `db/dist/migrate.js` is a bundle. → Task 3 step "docker compose build migrate api".

---

### Task 1: Remote types in contracts

**Files:**
- Create: `packages/contracts/src/remotes/remotes.contract.ts`, `packages/contracts/src/remotes/__tests__/remotes.contract.test.ts`
- Modify: `packages/contracts/src/index.ts` (re-export)

**Interfaces:**
- Produces: `REMOTE_TYPES` — the seven values as a readonly tuple (`as const`); `remoteTypeSchema = z.enum(REMOTE_TYPES)`; `type RemoteType = z.infer<typeof remoteTypeSchema>`.

- [ ] **Step 1: Write the failing test** — `REMOTE_TYPES` equals the seven values in the exact order above; `remoteTypeSchema` accepts each and rejects `'Air Conditioner'`, `'tv'` and `''`.
- [ ] **Step 2: Run** `pnpm vitest run --project unit packages/contracts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the contract file and re-export it.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the remote types to the contracts"`.

---

### Task 2: Schema, migration and constraint tests

**Files:**
- Modify: `packages/db/package.json` (dependency `"@airremote/contracts": "workspace:*"`), `packages/db/src/schema/remotes.ts`
- Create: `packages/db/src/schema/buttons.ts`; Modify: `packages/db/src/schema/index.ts` (re-export, after `remotes`)
- Create: generated `packages/db/migrations/0003_remotes_and_buttons.sql` (+ snapshot, journal)
- Create: `packages/db/src/schema/__tests__/remotes.itest.ts`, `packages/db/src/schema/__tests__/buttons.itest.ts`
- Modify: `vitest.config.ts` (integration `include` adds `'packages/*/src/**/__tests__/**/*.itest.ts'`), `packages/db/tsconfig.json` (include `../../backend/src/__tests__/postgres.global-setup.ts`, as `tools/device-sim` does, so the shared test helpers typecheck)

**Interfaces:**
- Consumes: Task 1 `REMOTE_TYPES`.
- Produces:
  - `remoteType = pgEnum('remote_type', REMOTE_TYPES)`; `remotes.type` (`remoteType('type').notNull()`); types `Remote`/`NewRemote` now include `type`.
  - `buttons = pgTable('buttons', { id: uuid().primaryKey().defaultRandom(), remoteId: uuid('remote_id').notNull().references(() => remotes.id, { onDelete: 'cascade' }), name: text().notNull(), timingsUs: integer('timings_us').array().notNull() })`; types `Button`, `NewButton`.
  - Unique indexes with `uniqueIndex(name).on(parentId, sql\`lower(${table.name})\`)`.
  - Checks with `check(name, sql\`…\`)`:
    - name (both tables): `char_length(name) BETWEEN 1 AND 100 AND name !~ '^\s' AND name !~ '\s$'`
    - `buttons_timings_us_shape_check`: `array_ndims(timings_us) = 1 AND cardinality(timings_us) BETWEEN 1 AND 2048 AND array_position(timings_us, NULL) IS NULL`
    - `buttons_timings_us_range_check`: `0 <= ALL(timings_us) AND 65535 >= ALL(timings_us)`
  - Note: for `'{}'`, `array_ndims` is `NULL` but `cardinality` is `0`, so the shape check fails as required; Review Focus 3.

- [ ] **Step 1: Write the failing itests.** Both files call `useTestDatabase()` (relative import from `backend/src/__tests__/test-db.ts`) and seed a user and a device. A helper `rejection(promise)` returns the Postgres error's `code` and `constraint_name` (from the error or its `cause`, as Drizzle wraps it). Raw inserts use `testDb.db.execute(sql\`…\`)` where Drizzle's types would refuse the value.
  - `remotes.itest.ts`:
    - "stores a remote with each type" — one insert per `REMOTE_TYPES` value, read back.
    - "rejects a type outside the list" — raw insert with `'tv'` → code `22P02`.
    - "rejects a remote without a type" — raw insert omitting `type` → `23502`.
    - "rejects the same name in another case" — `Living room` then `living room` on one device → `23505`, `remotes_device_id_name_key`; also `Σαλόνι` then `σαλόνι`.
    - "accepts the same name on two devices".
    - "rejects names with leading or trailing whitespace" — `' Power'`, `'Power '`, `'\tPower'`, `'Power\n'` → `23514`, `remotes_name_check`.
    - "rejects an empty name and one over 100 characters" — `''`, 101 × `'a'` → `remotes_name_check`; 100 × `'a'` accepted.
    - "deletes a device's remotes with it".
  - `buttons.itest.ts` (seeds a remote too):
    - "stores a button and reads its timings back intact" — `[9000, 4500, 560, 1690, 0, 65535]`.
    - "rejects the same name in another case within a remote; accepts it on another remote" → `buttons_remote_id_name_key`.
    - "rejects names with leading or trailing whitespace" and "rejects an empty name and one over 100 characters" → `buttons_name_check` (same cases as remotes).
    - "rejects a button without timings" — raw insert with `NULL` → `23502`.
    - "rejects malformed timings" — `'{}'`, 2049 entries, `'{{1,2},{3,4}}'`, `ARRAY[1, NULL]` → `buttons_timings_us_shape_check`; `65536`, `-1` → `buttons_timings_us_range_check`.
    - "accepts exactly 2048 entries".
    - "deletes a remote's buttons with it, and a device's remotes' buttons with the device".
- [ ] **Step 2: Run** `pnpm vitest run --project integration packages/db` — Expected: FAIL (`buttons` not exported; no `type` column).
- [ ] **Step 3: Implement** the schema; add the contracts dependency and `pnpm install`; run `pnpm db:generate --name remotes_and_buttons`; read the SQL; hand-edit only the `type` column: `ADD COLUMN "type" "remote_type";` then `UPDATE "remotes" SET "type" = 'generic_device';` then `ALTER TABLE "remotes" ALTER COLUMN "type" SET NOT NULL;`. Expected SQL otherwise: `CREATE TYPE "remote_type"`, `CREATE TABLE "buttons"` with the two checks and the foreign key, `DROP INDEX "remotes_device_id_idx"`, the two unique indexes, `remotes_name_check`. Run `pnpm db:generate` again — Expected: "No schema changes".
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS. Then `pnpm test` — Expected: PASS (existing tests that insert remotes, if any, must still pass; fix their fixtures by adding `type`, and say so in the ledger).
- [ ] **Step 5: Commit** — `git commit -m "Add remote types, button timings and their database rules"`.

---

### Task 3: The migration on existing data, the Docker image, docs

**Files:**
- Create: `packages/db/src/__tests__/migrations.itest.ts`
- Modify: `backend/src/__tests__/test-db.ts` (export `createEmptyTestDatabase(): Promise<TestDatabase>` — a new database with no template, i.e. not migrated), `CLAUDE.md` and `backend/README.md` only if they describe the schema or the test layout this changes

**Interfaces:**
- Consumes: `runMigrations(url, folder)` from `@airremote/db`; Task 2's migration.
- Produces: `createEmptyTestDatabase()` (same `TestDatabase` shape as `createTestDatabase`).

- [ ] **Step 1: Write the failing itest** "backfills type on existing remotes": an empty database; copy `packages/db/migrations` to a temp folder keeping only the entries of `meta/_journal.json` up to `0002_pairing_codes` (and their SQL files); `runMigrations` on it; raw-insert a user, a device and a remote (`name` `'Living room'`, no `type`); `runMigrations` with the real folder; the remote's `type` is `generic_device` and inserting a remote without a type now fails with `23502`.
- [ ] **Step 2: Run** `pnpm vitest run --project integration packages/db/src/__tests__/migrations.itest.ts` — Expected: FAIL (`createEmptyTestDatabase` not exported).
- [ ] **Step 3: Implement** `createEmptyTestDatabase` (`CREATE DATABASE "<name>"` without `TEMPLATE`).
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS. Mutation check: temporarily remove the `UPDATE` line from the migration and rerun — Expected: FAIL (`23502` while applying it); restore it.
- [ ] **Step 5: Docker** — `PAIRING_CODE_SECRET=build-only-placeholder-0123456789abcdef docker compose build migrate api` — Expected: builds. Then run the bundled migrator against a throwaway Postgres container (not the owner's database): `docker run` the built image with `node db/dist/migrate.js` and that container's `DATABASE_URL` — Expected: "Migrations applied".
- [ ] **Step 6: Run** `pnpm lint`, `pnpm typecheck`, `pnpm exec prettier --check .`, `pnpm test`, `pnpm build` — Expected: all clean.
- [ ] **Step 7: Commit** — `git commit -m "Test the remotes migration on existing data"`.
