# Device Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A device fetches a 15-minute pairing code over mTLS, and a signed-in user enrolls it with its MAC, that code and a name, creating the `devices` row the gateway already allows.

**Architecture:** The device listener gains `POST /pairing-code` (plain HTTP, next to `GET /ws`), identified by the certificate CN. The API gains its first protected route, `POST /devices`, behind a new `authenticate` preHandler. Both live in `features/devices`; codes are stored as an HMAC in a new `pairing_codes` table, and enrollment consumes the code and inserts the device in one transaction.

**Tech Stack:** Fastify 5, `fastify-type-provider-zod`, Zod 4, Drizzle + Postgres, `jose` (existing), `node:crypto`, Vitest 5 + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-26-device-enrollment-design.md`

## Global Constraints

- Follow `CLAUDE.md`: layer rules, `create*` factories, `__tests__/` next to the code, only `src/config` reads `process.env`, only repositories import `drizzle-orm`, migrations generated with `pnpm db:generate`.
- MAC input: `AA:BB:CC:DD:EE:FF`, colons only, any case; stored and returned lower case.
- Name: trimmed, 1–100 characters.
- Pairing code: 8 characters of `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, issued upper case without separators. Input: any case, hyphens and whitespace removed, `O`→`0`, `I`/`L`→`1`, then exactly 8 alphabet characters, else `400 VALIDATION_FAILED`.
- Code lifetime: **15 minutes**. Valid ⇔ `expires_at > now`.
- Stored code: `HMAC-SHA256(PAIRING_CODE_SECRET, normalisedCode)`, hex. The code itself is never stored or logged.
- Error codes (exact): `UNAUTHORIZED` 401, `INVALID_PAIRING_CODE` 400, `DEVICE_ALREADY_REGISTERED` 409, `INVALID_DEVICE_CERTIFICATE` 403.
- Error messages (exact): `Authentication required`, `Pairing code is invalid or has expired`, `Device is already registered`, `Client certificate does not identify a device`.
- A bad code is reported before anything about the MAC's enrollment status.
- `401` responses carry `WWW-Authenticate: Bearer`.
- Commit messages follow the repo style (plain imperative sentence) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line.
- Before each commit: `pnpm typecheck && pnpm lint` and `pnpm exec prettier --check .` clean.

## Review Focus

1. **MAC case across the two sides.** The device's CN is upper case (`AA:BB:CC:DD:EE:01`), the user types lower case; the code still matches and the device connects afterwards. → Task 6 e2e "enrolls with a lower-case MAC for a device whose CN is upper case".
2. **A typed code.** `7k4m-q9tx`-style input (lower case, hyphen, spaces, `O`/`I`/`L`) enrolls end to end, not only in the schema test. → Task 5 e2e "accepts the code typed in lower case with a hyphen".
3. **Two enrollments racing on one code.** Exactly one `201`; the other is `400 INVALID_PAIRING_CODE`, never a 500. → Task 2 itest "lets only one of two concurrent enrollments use a code".
4. **Leaking enrollment status.** A wrong code for an already-enrolled MAC is `400 INVALID_PAIRING_CODE`, not `409`. → Task 3 unit "reports a bad code before an enrolled MAC" and Task 2 itest "reports invalid-code for an enrolled MAC with no code".
5. **Authorization header variants.** Lower-case `bearer`, missing token, extra parts, a refresh token, an expired token: all `401` with `WWW-Authenticate: Bearer`; the route's service is never called. → Task 4 unit tests.

---

### Task 1: Contracts

**Files:**
- Create: `packages/contracts/src/devices/devices.contract.ts`
- Create: `packages/contracts/src/devices/__tests__/devices.contract.test.ts`
- Modify: `packages/contracts/src/index.ts` (re-export)
- Modify: `packages/contracts/src/errors/errors.contract.ts` (four codes)
- Test: `packages/contracts/src/errors/__tests__/errors.contract.test.ts` (if it lists codes, extend it)

**Interfaces:**
- Produces:
  - `PAIRING_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'`, `PAIRING_CODE_LENGTH = 8`
  - `normalisePairingCode(input: string): string` — upper case, strip `-` and whitespace, `O`→`0`, `I`/`L`→`1`. Does not validate.
  - `macAddressSchema` — `z.string()` with the MAC regex (no transform).
  - `pairingCodeInputSchema` — `z.string().max(32).transform(normalisePairingCode).pipe(<8 alphabet chars regex>)`.
  - `enrollDeviceRequestSchema = z.object({ macAddress: macAddressSchema, pairingCode: pairingCodeInputSchema, name })`, `name = z.string().trim().min(1).max(100)`; type `EnrollDeviceRequest` = `z.output<…>`.
  - `deviceResponseSchema = z.object({ id: z.uuid(), macAddress: z.string(), name: z.string() })`; type `DeviceResponse`.
  - `pairingCodeResponseSchema = z.object({ pairingCode: <8 alphabet chars regex>, expiresAt: z.iso.datetime() })`; type `PairingCodeResponse`.
  - `errorCodeSchema` gains `UNAUTHORIZED`, `INVALID_PAIRING_CODE`, `DEVICE_ALREADY_REGISTERED`, `INVALID_DEVICE_CERTIFICATE`.

- [ ] **Step 1: Write the failing tests** in `devices.contract.test.ts`:
  - `normalisePairingCode`: `'7k4m-q9tx'` → `'7K4MQ9TX'`; `' 7K4M Q9TX '` → `'7K4MQ9TX'`; `'o1il-0000'` → `'01110000'`.
  - `enrollDeviceRequestSchema.parse({ macAddress: 'AA:BB:CC:DD:EE:01', pairingCode: '7k4m-q9tx', name: '  Living room ' })` → `{ macAddress: 'AA:BB:CC:DD:EE:01', pairingCode: '7K4MQ9TX', name: 'Living room' }`.
  - Rejects (`safeParse(...).success === false`): MAC `aa-bb-cc-dd-ee-01`, `aabbccddee01`, `AA:BB:CC:DD:EE`; code `'7K4MQ9T'` (7), `'7K4MQ9TXX'` (9), `'7K4MQ9TU'` (`U`), `'7K4MQ9T!'`; name `''`, `'   '`, 101 × `'a'`; missing any field.
  - `pairingCodeResponseSchema` accepts `{ pairingCode: '7K4MQ9TX', expiresAt: '2026-10-26T12:15:00.000Z' }` and rejects `pairingCode: '7k4mq9tx'`.
  - `errorCodeSchema.options` includes the four new codes.
- [ ] **Step 2: Run** `pnpm vitest run --project unit packages/contracts` — Expected: FAIL (module `../devices.contract` not found).
- [ ] **Step 3: Implement** the contract file and the error codes; re-export from `index.ts`.
- [ ] **Step 4: Run** `pnpm vitest run --project unit packages/contracts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the device enrollment contracts"`.

---

### Task 2: `pairing_codes` table and repository

**Files:**
- Create: `packages/db/src/schema/pairing-codes.ts`; Modify: `packages/db/src/schema/index.ts`
- Create: generated migration under `packages/db/migrations/` (via `pnpm db:generate`)
- Modify: `backend/src/features/devices/devices.repository.ts`
- Test: `backend/src/features/devices/__tests__/devices.repository.itest.ts`

**Interfaces:**
- Produces:
  - `pairingCodes = pgTable('pairing_codes', { macAddress: macaddr('mac_address').primaryKey(), codeHash: text('code_hash').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull() })`; types `PairingCode`, `NewPairingCode`.
  - On `DevicesRepository`:
    - `savePairingCode(code: NewPairingCode): Promise<void>` — upsert on `mac_address` (replaces hash and expiry).
    - `enroll(input: { macAddress: string; codeHash: string; now: Date; userId: string; name: string }): Promise<EnrollResult>`
    - `type EnrollResult = { status: 'enrolled'; device: Device } | { status: 'invalid-code' } | { status: 'already-registered' }`
  - `enroll` runs in one `db.transaction`: `DELETE FROM pairing_codes WHERE mac_address = $mac AND code_hash = $hash AND expires_at > $now RETURNING` → none: `invalid-code`. Then insert the device with `onConflictDoNothing({ target: devices.macAddress })` → none: roll the transaction back (so the code is not consumed) and return `already-registered`. Rolling back is done by throwing a private sentinel inside the callback and catching it outside.

- [ ] **Step 1: Add the table**, re-export it, run `pnpm db:generate`, read the generated SQL (one `CREATE TABLE "pairing_codes"`, nothing else).
- [ ] **Step 2: Write the failing itests** (seed a user as the file already does; `now = new Date('2026-10-26T12:00:00Z')`, codes saved with `expiresAt` = `now + 15 min` unless stated):
  - "replaces the previous code for the same MAC" — save `h1`, save `h2` → `enroll` with `h1` is `invalid-code`, with `h2` is `enrolled`.
  - "enrolls with a valid code and consumes it" — result `enrolled`, device has `userId`, `name`, `macAddress: 'aa:bb:cc:dd:ee:02'`; a second `enroll` with the same hash is `invalid-code`.
  - "matches a MAC given in a different case" — saved `AA:BB:CC:DD:EE:02`, enrolled with `aa:bb:cc:dd:ee:02` → `enrolled`.
  - "refuses a wrong hash, another MAC's code, and an expired code" — three `invalid-code` cases; expired = `expiresAt === now`.
  - "reports invalid-code for an enrolled MAC with no code" — `aa:bb:cc:dd:ee:01` (seeded device) → `invalid-code`.
  - "keeps the code when the MAC is already enrolled" — save a code for the seeded MAC, `enroll` → `already-registered`; the `pairing_codes` row still exists.
  - "lets only one of two concurrent enrollments use a code" — `Promise.all` of two `enroll` calls with the same valid hash and different users → one `enrolled`, one `invalid-code`.
- [ ] **Step 3: Run** `pnpm vitest run --project integration backend/src/features/devices` — Expected: FAIL (`savePairingCode is not a function`).
- [ ] **Step 4: Implement** `savePairingCode` and `enroll`.
- [ ] **Step 5: Run** the same command — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "Add the pairing codes table and the enrollment transaction"`.

---

### Task 3: Code helpers, `PAIRING_CODE_SECRET` and the devices service

**Files:**
- Modify: `backend/src/features/devices/devices.helpers.ts` (+ `__tests__/devices.helpers.test.ts`)
- Modify: `backend/src/config/env.ts` (+ `__tests__/env.test.ts`), `backend/src/__tests__/test-utils.ts`, `.env.example`, `docker-compose.yml`, `backend/README.md`
- Modify: `backend/src/features/devices/devices.service.ts` (+ `__tests__/devices.service.test.ts`)
- Modify: `backend/src/device-server.ts` (pass the secret)

**Interfaces:**
- Consumes: Task 1 `normalisePairingCode`, `PAIRING_CODE_ALPHABET`, `PAIRING_CODE_LENGTH`, `DeviceResponse`, `PairingCodeResponse`, `EnrollDeviceRequest`; Task 2 `DevicesRepository`, `EnrollResult`.
- Produces:
  - `generatePairingCode(): string` — 8 × `crypto.randomInt` over the alphabet.
  - `hashPairingCode(code: string, secret: string): string` — HMAC-SHA256 hex of `code` as given (callers pass a normalised code).
  - `PAIRING_CODE_TTL_MS = 15 * 60 * 1000`
  - Env: `PAIRING_CODE_SECRET: secret` (the existing ≥32-character rule). `testEnv.PAIRING_CODE_SECRET = 'test-pairing-secret-0123456789abcdef'`.
  - `createDevicesService({ repository, pairingCodeSecret, now = () => new Date(), generateCode = generatePairingCode })`.
  - On `DevicesService`:
    - `issuePairingCode(commonName: string | null): Promise<PairingCodeResponse>` — null or not a MAC (`parseMacAddress`) → `AppError(403, 'INVALID_DEVICE_CERTIFICATE', …)`; already a device → `AppError(409, 'DEVICE_ALREADY_REGISTERED', …)`; else save `{ macAddress, codeHash, expiresAt: now + TTL }` and return `{ pairingCode, expiresAt: expiresAt.toISOString() }`.
    - `enroll(userId: string, input: EnrollDeviceRequest): Promise<DeviceResponse>` — `repository.enroll({ macAddress: input.macAddress.toLowerCase(), codeHash: hashPairingCode(input.pairingCode, secret), now: now(), userId, name: input.name })`; `invalid-code` → `AppError(400, 'INVALID_PAIRING_CODE', …)`; `already-registered` → `AppError(409, 'DEVICE_ALREADY_REGISTERED', …)`; `enrolled` → `{ id, macAddress, name }`.
  - `authorizeConnection` unchanged in behaviour; its "placeholder" comment is rewritten to say enrollment creates the row.

- [ ] **Step 1: Write the failing tests.**
  - helpers: `generatePairingCode()` matches `/^[0-9A-HJKMNP-TV-Z]{8}$/` over 1000 calls and yields > 990 distinct values; `hashPairingCode('7K4MQ9TX', 's')` equals `createHmac('sha256','s').update('7K4MQ9TX').digest('hex')` and differs for another secret.
  - env: missing `PAIRING_CODE_SECRET` and a 31-character one both throw naming `PAIRING_CODE_SECRET` (add it to the file's `valid` fixture).
  - service (fake repository recording calls, `now` fixed at `2026-10-26T12:00:00.000Z`, `generateCode` → `'7K4MQ9TX'`):
    - "issues a code that expires in 15 minutes" → `{ pairingCode: '7K4MQ9TX', expiresAt: '2026-10-26T12:15:00.000Z' }`; saved `{ macAddress: 'aa:bb:cc:dd:ee:01', codeHash: hashPairingCode('7K4MQ9TX', secret), expiresAt }` for CN `AA:BB:CC:DD:EE:01`.
    - "refuses a code to a null or non-MAC CN with 403" (`null`, `'device-01'`), nothing saved.
    - "refuses a code to an enrolled device with 409", nothing saved.
    - "enrolls with the lower-cased MAC and the hashed code" → repository got `macAddress: 'aa:bb:cc:dd:ee:01'`, the HMAC of `'7K4MQ9TX'`, `now`, `userId`, `name`; returns `{ id, macAddress, name }` only (no `userId` even if the fake device has it).
    - "reports a bad code before an enrolled MAC" — repository `invalid-code` → `INVALID_PAIRING_CODE` 400.
    - "maps already-registered to 409 DEVICE_ALREADY_REGISTERED".
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/features/devices backend/src/config` — Expected: FAIL (missing exports / env field).
- [ ] **Step 3: Implement** helpers, env (plus `.env.example` entry `PAIRING_CODE_SECRET=dev-only-pairing-secret-change-me-0123456789`, compose `PAIRING_CODE_SECRET: ${PAIRING_CODE_SECRET:?Set PAIRING_CODE_SECRET in .env}`, README env table/list), `testEnv`, service; pass `pairingCodeSecret: env.PAIRING_CODE_SECRET` in `device-server.ts`.
- [ ] **Step 4: Run** the Step 2 command, then `pnpm test` — Expected: PASS (existing device e2e tests unaffected).
- [ ] **Step 5: Commit** — `git commit -m "Issue pairing codes and enroll devices in the devices service"`.

---

### Task 4: The sign-in check

**Files:**
- Create: `backend/src/plugins/authenticate.ts`
- Test: `backend/src/plugins/__tests__/authenticate.test.ts`
- Modify: `backend/src/app.ts` (register after `cookie`, before routes)

**Interfaces:**
- Consumes: `verifyAccessToken`, `TokenSecrets` from `features/auth/auth.helpers.ts`.
- Produces:
  - `authenticatePlugin = fp<{ secrets: TokenSecrets }>(…, { name: 'authenticate' })` — `decorateRequest('userId', null)`; `decorate('authenticate', preHandler)`.
  - Module augmentation: `FastifyRequest.userId: string | null`; `FastifyInstance.authenticate: preHandlerAsyncHookHandler`.
  - `authenticatedUserId(request: FastifyRequest): string` — returns `request.userId`, or throws `new Error('Route is missing the authenticate preHandler')`.
  - Header rule: `/^Bearer ([^\s]+)$/i` on `authorization`; otherwise, or when `verifyAccessToken` returns null: `reply.header('www-authenticate', 'Bearer')` and throw `AppError(401, 'UNAUTHORIZED', 'Authentication required')`.

- [ ] **Step 1: Write the failing tests** — a test app (`buildTestApp()` + `authenticatePlugin` with `testEnv` secrets) with `GET /whoami` using `{ preHandler: app.authenticate }` returning `{ userId: authenticatedUserId(request) }`:
  - valid access token (`signAccessToken('user-1', secrets)`) → 200 `{ userId: 'user-1' }`; also with scheme `bearer`.
  - 401 with body `{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }` and header `www-authenticate: Bearer` for: no header; `Basic abc`; `Bearer`; `Bearer a b`; a refresh token; a token signed with another secret; an expired token (`vi.useFakeTimers`, advance 11 min).
  - an unprotected route on the same app still answers 200 without a header.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/plugins` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement**; register in `app.ts` with `{ secrets: { accessSecret: env.JWT_ACCESS_SECRET, refreshSecret: env.JWT_REFRESH_SECRET } }`. If the error handler drops the `www-authenticate` header set before the throw, send the 401 envelope from the preHandler directly instead, and ledger the ruling.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the sign-in check for protected routes"`.

---

### Task 5: `POST /devices` on the API

**Files:**
- Create: `backend/src/features/devices/devices.routes.ts`
- Test: `backend/src/features/devices/__tests__/devices.routes.test.ts`
- Modify: `backend/src/app.ts` (`app.register(devicesRoutes, { prefix: '/devices', env })`)
- Create: `backend/e2e/devices.e2e.ts`

**Interfaces:**
- Consumes: Task 1 schemas; Task 3 `createDevicesService`, `DevicesService`; Task 4 `app.authenticate`, `authenticatedUserId`.
- Produces: `devicesRoutes: FastifyPluginAsyncZod<{ env: Env; service?: DevicesService }>` — builds the service from `app.db` and `env.PAIRING_CODE_SECRET` unless given; `POST /` with `preHandler: app.authenticate`, schema `body: enrollDeviceRequestSchema`, `response: { 201: deviceResponseSchema }`; logs `info({ deviceId, macAddress, userId }, 'Device enrolled')`; replies 201.

- [ ] **Step 1: Write the failing route tests** (fake service recording `enroll` calls; app with `authenticatePlugin` + `devicesRoutes` `{ env: testEnv, service }`; token from `signAccessToken`):
  - 201 with the device; the service got `('user-1', { macAddress: 'AA:BB:CC:DD:EE:01', pairingCode: '7K4MQ9TX', name: 'Living room' })` for body code `'7k4m-q9tx'` and name `' Living room '`.
  - 401 without a token; service not called.
  - 400 `VALIDATION_FAILED` for a dashed MAC and for a 7-character code; service not called.
  - the service's `AppError(400, 'INVALID_PAIRING_CODE', …)` and `AppError(409, 'DEVICE_ALREADY_REGISTERED', …)` pass through as envelopes.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src/features/devices` — Expected: FAIL.
- [ ] **Step 3: Implement** the route and register it.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Write the e2e tests** in `devices.e2e.ts` with `useTestApp()`: register + log in (as `auth.e2e.ts` does), then seed a pairing code directly in the database with `hashPairingCode(code, testEnv.PAIRING_CODE_SECRET)`. `useTestApp` does not expose its database today: add a `db` getter to it (a `DbHandle` on the same database, closed in `afterAll`).
  - 201 and the row exists under the user; a second enroll with the same code → 400 `INVALID_PAIRING_CODE`.
  - "accepts the code typed in lower case with a hyphen".
  - 400 `INVALID_PAIRING_CODE` for a wrong code and for an expired one (seeded with a past `expiresAt`).
  - 409 `DEVICE_ALREADY_REGISTERED` when the MAC is already a device and a valid code exists.
  - 401 with no token.
- [ ] **Step 6: Run** `pnpm vitest run --project e2e backend/e2e/devices.e2e.ts` — Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "Add the device enrollment endpoint"`.

---

### Task 6: `POST /pairing-code` on the device listener, and the whole flow

**Files:**
- Create: `backend/src/shared/device-certificate.ts` (+ `shared/__tests__/device-certificate.test.ts`)
- Modify: `backend/src/plugins/device-upgrade.ts` (import `peerCommonName` from there; its tests keep passing)
- Create: `backend/src/features/devices/devices.device-routes.ts` (+ `__tests__/devices.device-routes.test.ts`)
- Modify: `backend/src/device-server.ts` (register `zodPlugin` before `errorHandlerPlugin`; register the device routes)
- Modify: `backend/e2e/support/device-server.ts`; Create: `backend/e2e/device-pairing.e2e.ts`

**Interfaces:**
- Consumes: Task 3 `DevicesService.issuePairingCode`; Task 1 `pairingCodeResponseSchema`.
- Produces:
  - `peerCommonName(request: FastifyRequest): string | null` (moved unchanged from `device-upgrade.ts`).
  - `devicesDeviceRoutes: FastifyPluginAsyncZod<{ service: DevicesService }>` — `POST /pairing-code`, schema `response: { 201: pairingCodeResponseSchema }`, calls `service.issuePairingCode(peerCommonName(request))`, logs `info({ macAddress: <lower-cased CN> }, 'Pairing code issued')` (never the code), replies 201. Naming: `<feature>.device-routes.ts` is a route plugin served on the device listener.
  - `useDeviceServer({ …, api?: boolean })` — with `api: true` also starts `buildApp({ env: testEnv, db: handle })` on the same database and exposes `apiUrl`. New helper `postToDevice(path: string, cert: TestClientName | null): Promise<{ status: number; body: unknown }>` over `node:https` with the run's CA and client certificate, no request body.

- [ ] **Step 1: Write the failing unit tests.**
  - `peerCommonName`: string CN → it; array CN → null; no subject → null (fake `raw.socket.getPeerCertificate`, as `device-upgrade.test.ts` does).
  - device routes (fake service; `app.inject` has no TLS socket, so an `onRequest` hook in the test sets `request.raw.socket.getPeerCertificate = () => ({ subject: { CN } })`): 201 with the service's response for CN `AA:BB:CC:DD:EE:01`, service called with that CN; the service's 403/409 `AppError`s pass through as envelopes.
- [ ] **Step 2: Run** `pnpm vitest run --project unit backend/src` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement**; wire into `device-server.ts`.
- [ ] **Step 4: Run** the Step 2 command — Expected: PASS.
- [ ] **Step 5: Write the e2e tests** in `device-pairing.e2e.ts` with `useDeviceServer({ api: true })`:
  - `allowed` gets 201 `{ pairingCode: /^[0-9A-HJKMNP-TV-Z]{8}$/, expiresAt }` with `expiresAt` 15 min ± 5 s from now.
  - asking twice: the first code no longer enrolls, the second does.
  - `notAMac` and `twoCommonNames` → 403 `INVALID_DEVICE_CERTIFICATE`; `foreignCa` and no certificate fail the TLS handshake (request rejects).
  - an enrolled device (`allowDevice`) → 409 `DEVICE_ALREADY_REGISTERED`.
  - "the whole flow": `allowed` cannot open `/ws` (403); it gets a code; a user registers, logs in and `POST /devices` with `macAddress: 'aa:bb:cc:dd:ee:01'` (this is also "enrolls with a lower-case MAC for a device whose CN is upper case") → 201; `allowed` now opens `/ws`.
- [ ] **Step 6: Run** `pnpm vitest run --project e2e backend/e2e` — Expected: PASS (new and existing device tests).
- [ ] **Step 7: Commit** — `git commit -m "Issue pairing codes on the device listener"`.

---

### Task 7: Documentation and the final check

**Files:**
- Modify: `CLAUDE.md`, `backend/README.md`

- [ ] **Step 1: Update `CLAUDE.md`:** protected routes use `{ preHandler: app.authenticate }` and read the user with `authenticatedUserId(request)`; `<feature>.device-routes.ts` holds HTTP routes served on the device listener; `useTestApp()` exposes `db`; `useDeviceServer({ api: true })` runs both servers on one database.
- [ ] **Step 2: Update `backend/README.md`:** a short "Enrolling a device" section (device `POST /pairing-code` → QR → user `POST /devices`), and `PAIRING_CODE_SECRET` wherever the JWT secrets are documented.
- [ ] **Step 3: Run** `pnpm lint && pnpm typecheck && pnpm exec prettier --check . && pnpm test && pnpm build` — Expected: all clean, every test passes.
- [ ] **Step 4: Commit** — `git commit -m "Document device enrollment"`.
