# Frontend Boilerplate and Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Expo app in `frontend/` built on the owner's blueprint architecture (layers, Query + Zustand, one validated HTTP client that refreshes on 401, vendored HeroUI Native behind `@ui`), with CORS on the backend so web can sign in, and the Claude Code skills that teach agents to build on it.

**Architecture:** The blueprint's layered `src/` (app → navigation → screens → components → hooks → contexts → stores/queries → helpers → api → adapters/utils/config/types), with import rules enforced by a generated ESLint config in the root flat config. `tsconfig.json` paths are the single alias source (Metro reads them; Jest's mapper is built from them). The HTTP client validates every body with `@airremote/contracts` and is wired to the auth store only through injected hooks in `src/app/bootstrap.ts`.

**Tech Stack:** Expo SDK 58 (React Native 0.88, development builds), TypeScript strict, React Navigation 7, TanStack Query 5, Zustand 5, axios, Zod 4 (`@airremote/contracts`), react-hook-form, i18next/react-i18next, MMKV 4, Uniwind + Tailwind 4, vendored HeroUI Native 1.0.11, Jest 30 + jest-expo + @testing-library/react-native 14. Backend: `@fastify/cors` 11.

**Spec:** `docs/superpowers/specs/2026-10-27-frontend-boilerplate-design.md` (read it first). The blueprint it adapts is `REACT_NATIVE_BLUEPRINT.md` at the repo root (untracked, never committed); where this plan says "blueprint §X", read that section for the reference code.

## Global Constraints

- Work on branch `rewrite/frontend-boilerplate`. Commit messages follow the repo's style (a plain sentence, e.g. "Add the frontend's HTTP client"), not conventional commits, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read from, import, copy or build from `legacy/` (root `CLAUDE.md`).
- Package manager is pnpm (workspace). Install every frontend package at its latest stable version (for Expo-managed packages: the version `pnpm expo install` picks) and **pin exact versions** in `frontend/package.json` (no `^`/`~`).
- Do not switch the workspace to `node-linker=hoisted` or change root ESLint/TypeScript/Prettier versions. If something only works that way, stop and report.
- App name `AirRemote`, slug `airremote`, scheme `airremote`, id `com.airremote.app` (production) and `com.airremote.app.dev` (development), for both Android package and iOS bundle id.
- Environments: `development` and `production` only.
- Errors shown to users come from i18n by error code; the server's `message` is never displayed.
- All files and folders in `frontend/src` are kebab-case; types PascalCase, no `I` prefix; components and screens use default exports, everything else named exports (blueprint §2.5). No `styles/` folder and no `@styles` alias (Tailwind classes replace them); no `@root` alias.
- Tests sit next to the file they test (`<name>.test.ts(x)`), never in `__tests__/` inside `frontend/`.
- Only `frontend/src/config/` and `frontend/app.config.ts` read `process.env` (ESLint enforces it, Task 4).
- No `any`, no `!` non-null assertions, no `../` imports in `frontend/src` (except inside the vendored kit).
- English is the only language (`en`, default and fallback).

## Review Focus

1. **A request aborted by TanStack Query (unmounted screen, changed key)** must reject quietly: code `REQUEST_CANCELLED`, no refresh, no toast, no sign-out. Pinned in Task 6 (`toApiError` and http-client tests) and Task 7 (query client does not notify on cancelled).
2. **Several requests get a 401 and the refresh then fails** — everything waiting must reject and `onSessionExpired` must run exactly once, not once per request. Pinned in Task 6.
3. **A request retried with a fresh token gets a 401 again** — no second refresh, no loop; the session ends once. Pinned in Task 6.
4. **The app starts offline or with the API down** — the user sees the "couldn't connect" screen, not Login, and Retry works once the API is back. Pinned in Task 9 (`useSessionHydration`).
5. **Signing out while offline** — the user is still signed out locally and the query cache is emptied, even though `POST /auth/logout` failed. Pinned in Task 9 (`useLogout`).

---

## File structure

```
backend/src/config/env.ts                    CORS_ORIGINS
backend/src/plugins/cors.ts                  @fastify/cors with the allowed origins
frontend/
  app.config.ts  babel.config.js  metro.config.js  jest.config.js  jest.setup.ts
  tsconfig.json  index.ts  .env.development  .env.production  .prettierrc.mjs
  README.md  ARCHITECTURE.md
  eslint/layer-boundaries.mjs (+ layer-boundaries.test.ts)
  mocks/file.mock.ts
  scripts/create-new.mjs  scripts/templates/*
  src/
    app/        app.tsx bootstrap.ts query-client.ts notify-api-error.ts
    navigation/ root-navigator.tsx root-navigation-container.tsx linking.ts
    screens/    loading-screen/ loading-failed-screen/
    hooks/      use-auth/ use-session-hydration/ use-login/ use-logout/
                use-debounced-value/ use-refresh-on-focus/ use-sync-language/
    stores/     stores.constants.ts auth/ preferences/
    queries/    query-client.ts queries.constants.ts auth/
    helpers/    auth/ errors/
    api/        api.constants.ts api-error.ts http-client.ts servers.ts auth/
    adapters/   storage/
    utils/      platform/ logger/ navigation/ tests/
    config/     env/
    i18n/       config.ts i18n.constants.ts resources.ts locales/en/*.json
    ui/         index.ts global.css theme.css toast/ ui-provider/ heroui/ (vendored)
    types/      index.ts api.types.ts storage.types.ts navigation.types.ts
                axios.d.ts react-query.d.ts i18n.d.ts
    modules/
      auth/     navigation/ screens/login-screen/ i18n/locales/en/auth.json
      home/     navigation/ screens/home-screen/ i18n/locales/en/home.json
.claude/skills/frontend-*/SKILL.md (9 skills)
```

Empty layer folders the structure needs (`components/`, `contexts/`, `assets/`, module sub-folders) get a `.gitkeep`.

---

### Task 0: Branch and spec

- [ ] **Step 1:** `git checkout -b rewrite/frontend-boilerplate`
- [ ] **Step 2:** Commit the spec and this plan: `git add docs/superpowers/specs/2026-10-27-frontend-boilerplate-design.md docs/superpowers/plans/2026-10-27-frontend-boilerplate.md && git commit -m "Design and plan the frontend boilerplate"` (with the trailer). Do not add `REACT_NATIVE_BLUEPRINT.md`.

---

### Task 1: Backend CORS

**Files:**
- Modify: `backend/package.json` (add `@fastify/cors`, latest 11.x, matching the backend's `^` style), `backend/src/config/env.ts`, `backend/src/app.ts`, `backend/src/__tests__/test-utils.ts` (`testEnv.CORS_ORIGINS: []`), `.env.example`, `backend/README.md`
- Create: `backend/src/plugins/cors.ts`, `backend/src/plugins/__tests__/cors.test.ts`
- Test: `backend/src/config/__tests__/env.test.ts`

**Interfaces:**
- Produces: `Env['CORS_ORIGINS']: string[]`; `corsPlugin` (fastify-plugin) with options `{ origins: string[] }`.

- [ ] **Step 1: Failing env tests** in `env.test.ts`:
  - `'applies defaults'` now expects `CORS_ORIGINS: []`.
  - `it('splits CORS_ORIGINS on commas and trims them')`: `loadEnv({ ...valid, CORS_ORIGINS: 'http://localhost:8081, https://app.example.com' }).CORS_ORIGINS` equals `['http://localhost:8081', 'https://app.example.com']`.
  - `it('treats an empty CORS_ORIGINS as none')`: `''` → `[]`.
  - `it('rejects a CORS origin that is not an origin')`: `'localhost:8081'` and `'http://localhost:8081/path'` each throw `ConfigError` naming `CORS_ORIGINS`.
- [ ] **Step 2:** `pnpm vitest run --project unit backend/src/config` → the new tests FAIL.
- [ ] **Step 3:** Add `CORS_ORIGINS` to `envSchema`: default `''`, split on `,`, trim, drop empties, each must be an `http`/`https` URL whose `new URL(x).origin === x` (scheme + host + optional port, no path or trailing slash). Run → PASS.
- [ ] **Step 4: Failing plugin tests** in `plugins/__tests__/cors.test.ts`, using `buildApp({ env: { ...testEnv, CORS_ORIGINS: ['http://localhost:8081'] }, db: fakeDb(async () => []) })` and `app.inject`:
  - `'answers a preflight from an allowed origin with credentials'`: `OPTIONS /auth/login` with `origin: http://localhost:8081`, `access-control-request-method: POST`, `access-control-request-headers: content-type` → status 204, `access-control-allow-origin` = `http://localhost:8081`, `access-control-allow-credentials` = `true`.
  - `'adds CORS headers to a request from an allowed origin'`: `GET /health` with that origin → `access-control-allow-origin` = the origin, `access-control-allow-credentials` = `true`.
  - `'adds no CORS headers for another origin'`: origin `http://evil.example` → no `access-control-allow-origin` header.
  - `'adds no CORS headers when CORS_ORIGINS is empty'`: `testEnv` as is, allowed origin → no header.
  (These go through the whole app with `inject`, which covers what the spec's "e2e test" asked for without a database.)
- [ ] **Step 5:** Run → FAIL.
- [ ] **Step 6:** Implement `backend/src/plugins/cors.ts` (wraps `@fastify/cors` with `origin: origins`, `credentials: true`, `methods: ['GET','HEAD','POST','PUT','PATCH','DELETE']`), registered in `app.ts` right after `cookie`, only when `env.CORS_ORIGINS.length > 0`. Run → PASS.
- [ ] **Step 7:** `.env.example`: a commented `CORS_ORIGINS=http://localhost:8081` block ("Origins allowed to call the API from a browser with credentials, comma-separated. The Expo web dev server is http://localhost:8081."). `backend/README.md`: a short "Browser clients (CORS)" section. Also add it to your local `.env` if you run `pnpm dev` later (not committed).
- [ ] **Step 8:** `pnpm lint && pnpm typecheck && pnpm test:unit` pass. Commit "Allow browser origins to call the API with CORS".

---

### Task 2: Expo app in the workspace, env config and Jest

**Files:**
- Create: `frontend/` via `pnpm create expo-app@latest frontend --template blank-typescript --no-install`, then: `frontend/package.json`, `app.config.ts` (replaces `app.json`), `index.ts`, `tsconfig.json`, `babel.config.js` (only if the template needs one), `jest.config.js`, `jest.setup.ts`, `mocks/file.mock.ts`, `.env.development`, `.env.production`, `src/config/env/{env.ts,env.types.ts,index.ts,env.test.ts}`, `src/app/app.tsx` (temporary "AirRemote" text, rewritten in Task 10)
- Modify: `pnpm-workspace.yaml` (add `frontend`), root `package.json` scripts, root `.gitignore`, root `.prettierignore`, root `vitest.config.ts` (nothing yet)

**Interfaces:**
- Produces: `parseEnv(raw: RawEnv): AppEnv`, `ENV: Readonly<AppEnv>` from `@config/env`, where `type AppEnvironment = 'development' | 'production'` and `type AppEnv = { appEnv: AppEnvironment; apiUrl: string }`. Root scripts `test`, `test:unit`, `test:frontend`. The full alias set in `tsconfig.json`.

- [ ] **Step 1:** Scaffold, rename the package to `@airremote/frontend` (`"private": true`), delete the template's `App.tsx`/assets you don't need, keep `main` pointing at `index.ts` (`registerRootComponent(App)` from `./src/app/app`). Add `frontend` to `pnpm-workspace.yaml`, `pnpm install`, then `pnpm --filter @airremote/frontend exec expo install react-dom react-native-web @expo/metro-runtime` and the Jest set (`jest-expo`, `jest`, `@testing-library/react-native`, `@types/jest`). Pin every version exactly.
- [ ] **Step 2: `app.config.ts`:** reads `process.env.EXPO_PUBLIC_APP_ENV` (default `development`); `name` is `AirRemote` (`AirRemote Dev` in development), `ios.bundleIdentifier` / `android.package` per Global Constraints, `scheme: 'airremote'`, `newArchEnabled` as the SDK defaults, `web.bundler: 'metro'`, `userInterfaceStyle: 'automatic'`.
- [ ] **Step 3: Env files**, committed: `.env.development` (`EXPO_PUBLIC_APP_ENV=development`, `EXPO_PUBLIC_API_URL=http://localhost:3000`) and `.env.production` (`EXPO_PUBLIC_APP_ENV=production`, `EXPO_PUBLIC_API_URL=https://api.airremote.invalid` with a comment that the real URL is set when production exists). Root `.gitignore`: add `!frontend/.env.development`, `!frontend/.env.production` after `.env.*`, plus `frontend/android/`, `frontend/ios/`, `frontend/.expo/`, `frontend/web-build/`, `frontend/coverage/`, `frontend/expo-env.d.ts` (Expo regenerates it). Uniwind's generated `src/ui/uniwind-types.d.ts` (Task 3) **is** committed, so `pnpm typecheck` works without Metro having run. `.env.local` stays ignored (overrides such as the emulator's `http://10.0.2.2:3000`).
- [ ] **Step 4: `tsconfig.json`:** extends `expo/tsconfig.base`; `strict` and `noUncheckedIndexedAccess` on (the kit's own tsconfig uses both); other options as Expo's base sets them; `paths` exactly:
  `@adapters/*, @api/*, @app-types, @app-types/*, @assets/*, @components/*, @config/*, @contexts/*, @helpers/*, @hooks/*, @i18n/*, @modules/*, @navigation/*, @queries/*, @screens/*, @stores/*, @ui, @ui/*, @utils/*, @mocks/*` → the matching `./src/...` folder (`@mocks/*` → `./mocks/*`). `exclude`: `node_modules`, `android`, `ios`, `.expo`, `web-build`. Confirm Metro resolves them (Expo's `tsconfigPaths` is on by default; set `experiments.tsconfigPaths: true` in `app.config.ts` if not).
- [ ] **Step 5: `jest.config.js`:** `preset: 'jest-expo'`; `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`; `moduleNameMapper` built from `tsconfig.json` `compilerOptions.paths` with `ts.readConfigFile` (alias `X/*` → `^X/(.*)$` → `<rootDir>/<target>/$1`; exact alias `X` → `^X$`), plus the asset regex → `<rootDir>/mocks/file.mock.ts` (blueprint §11.1); `transformIgnorePatterns` per jest-expo's pnpm guidance (the `node_modules/(?!(?:.pnpm/.+?/node_modules/)?(...))` form) covering `react-native`, `@react-native`, `expo*`, `@expo*`, `@react-navigation`, `uniwind`, `tailwind-variants`, `react-native-reanimated`, `react-native-worklets`, `@gorhom`, `@airremote/contracts` and anything later tasks add; `collectCoverageFrom` as blueprint §11.1 minus `styles`, plus `!src/ui/heroui/**`. `jest.setup.ts` starts empty except `@testing-library/react-native`'s matchers if v14 needs an import.
- [ ] **Step 6: Failing tests** `src/config/env/env.test.ts`:
  - `'reads the app environment and API URL'`: `parseEnv({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_API_URL: 'https://api.example.com' })` → `{ appEnv: 'production', apiUrl: 'https://api.example.com' }`.
  - `'names every missing variable'`: `parseEnv({})` throws an `Error` whose message contains both `EXPO_PUBLIC_APP_ENV` and `EXPO_PUBLIC_API_URL`.
  - `'rejects an unknown environment'`: `EXPO_PUBLIC_APP_ENV: 'stage'` throws.
  - `'rejects an API URL that is not a URL'`: `'localhost:3000'` throws.
  - `'drops a trailing slash from the API URL'`: `'http://localhost:3000/'` → `apiUrl: 'http://localhost:3000'`.
- [ ] **Step 7:** `pnpm --filter @airremote/frontend test` → FAIL. Implement `env.ts` with Zod; `ENV = Object.freeze(parseEnv({ EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL }))` — each variable referenced statically so Expo inlines it. Run → PASS.
- [ ] **Step 8: Scripts.** `frontend/package.json`: `start` (`expo start`), `android` (`expo run:android`), `ios` (`expo run:ios`), `web` (`expo start --web`), `prebuild` (`expo prebuild`), `typecheck` (`tsc --noEmit`), `test` (`jest`), `create-new` (`node scripts/create-new.mjs`, added in Task 12 — leave out until then). Root `package.json`: `"test": "vitest run && pnpm test:frontend"`, `"test:unit": "vitest run --project unit && pnpm test:frontend"`, `"test:frontend": "pnpm --filter @airremote/frontend test"`. Root `.prettierignore`: add `frontend/android`, `frontend/ios`, `frontend/.expo`, `frontend/web-build`.
- [ ] **Step 9: Verify:** `pnpm typecheck`, `pnpm test:frontend`, `pnpm --filter @airremote/frontend exec expo-doctor` (fix what it reports, or note why a check doesn't apply), and `pnpm --filter @airremote/frontend web` serves a page showing "AirRemote" (check with `curl -s localhost:8081 | head` then stop it). Commit "Add the Expo app to the workspace".

---

### Task 3: Vendored HeroUI Native, Uniwind and the web spike

**Files:**
- Create: `frontend/src/ui/heroui/**` (copied), `frontend/src/ui/heroui/LICENSE`, `frontend/src/ui/heroui/VENDOR.md`, `frontend/src/ui/global.css`, `frontend/src/ui/toast/{toast.ts,toast-bridge.tsx,index.ts,toast.test.tsx}`, `frontend/src/ui/ui-provider/{ui-provider.tsx,index.ts}`, `frontend/src/ui/index.ts`, `frontend/src/ui/ui.smoke.test.tsx`
- Modify: `frontend/metro.config.js`, `frontend/package.json`, `frontend/jest.setup.ts`, `frontend/jest.config.js`, `frontend/tsconfig.json` (Uniwind's generated types file in `include`)

**Interfaces:**
- Produces from `@ui`: `UiProvider` (`{ children: ReactNode }`; wraps `HeroUINativeProvider` and mounts `ToastBridge`), `toast` (`{ success(message: string): void; error(message: string): void }`), and re-exports of `Button`, `TextField` and the parts a labelled field with an error needs (the kit's own names, e.g. `Label`, `Input`, `FieldError`, `Description`), `Card`, `Spinner`, `Dialog`, `Text`, `Surface`, `Toast`, `useToast`. Nothing outside `src/ui/` and `src/app/` imports `@ui/*` sub-paths (Task 4 enforces).

- [ ] **Step 1: Copy** `src/` of `https://github.com/heroui-inc/heroui-native` at tag `v1.0.11` (commit `1980fbb`) into `frontend/src/ui/heroui/`, without `__tests__`, `*.md` component docs and the `example`/`docs` folders. Copy the repo's `LICENSE`.
- [ ] **Step 2: Rewrite** every `from 'heroui-native'` (and `'heroui-native/...'`) inside the copy to a relative path to the vendored file it means (it is the kit's own `src/index.tsx` or sub-entry; keep the copy free of our aliases so it stays portable). Record the exact command used in `VENDOR.md`.
- [ ] **Step 3: Dependencies.** Install what the copied source imports: `uniwind`, `tailwindcss` (4), `tailwind-variants`, `tailwind-merge`, `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-svg`, `@expo/vector-icons`, and the optional peers the provider or our components reach (`react-native-screens`, `@gorhom/bottom-sheet`, `expo-blur` — install them; they are peers of the kit). Use `expo install` for the Expo-managed ones. Pin exactly.
- [ ] **Step 4: Uniwind.** `metro.config.js`: Expo's default config wrapped with `withUniwindConfig(config, { cssEntryFile: './src/ui/global.css', dtsFile: './src/ui/uniwind-types.d.ts' })`. `global.css`: `@import 'tailwindcss'; @import 'uniwind';` then the vendored `./heroui/styles/index.css`, and `@source './heroui';` plus `@source '..';` (so classes in app code are picked up). Import `./global.css` once from `src/app/app.tsx`. Babel: add Reanimated/Worklets' plugin only if the SDK's preset doesn't already include it (SDK 58's `babel-preset-expo` does; check, don't duplicate).
- [ ] **Step 5: Toast facade tests** `src/ui/toast/toast.test.tsx`:
  - `'shows an error through the mounted bridge'`: render `<UiProvider><View /></UiProvider>`, call `toast.error('Boom')` inside `act`, expect `screen.getByText('Boom')`.
  - `'drops a toast when no bridge is mounted'`: no render; `toast.error('x')` does not throw.
  - `'stops using a bridge after it unmounts'`: render, unmount, `toast.error('x')` does not throw and renders nothing.
- [ ] **Step 6:** Implement `toast.ts` (module-level `ToastSink | null`, `registerToastSink(sink): () => void`), `toast-bridge.tsx` (calls HeroUI's `useToast()`, registers on mount, unregisters in cleanup; `error` uses variant `danger`, `success` variant `success` — use the kit's actual variant names), `ui-provider.tsx`. Jest: add whatever mocks the kit needs to `jest.setup.ts` (Reanimated's `setUpTests()` / mock, Gesture Handler's `jestSetup`, Worklets' mock, a pass-through `react-native-safe-area-context` with zero insets, Uniwind if its runtime needs one). Run → PASS.
- [ ] **Step 7: Smoke test** `src/ui/ui.smoke.test.tsx`: `'renders a button and a text field from @ui'` — render `<UiProvider>` with `<Button onPress={onPress}><Button.Label>Go</Button.Label></Button>` (use the kit's real API) and a `TextField` with label `Email`; `userEvent.press(getByRole('button', { name: 'Go' }))` calls `onPress`; `getByLabelText('Email')` exists. Run → PASS.
- [ ] **Step 8: Web spike (gate).** Temporarily render in `app.tsx`: `UiProvider` with a `Card`, a `TextField`, a `Button` that calls `toast.success('Hello')`. Run `pnpm --filter @airremote/frontend web` and open `http://localhost:8081` with the Playwright MCP tools: the card, field and button render with HeroUI's styling (not unstyled), pressing the button shows the toast, the console has no errors. Take a screenshot. Fix what breaks **in the vendored copy**, each fix listed in `VENDOR.md` (file, why). **Stop and report to the owner** if the fixes reach beyond the provider and these components (portal, bottom-sheet, animation layers). Remove the spike content from `app.tsx` after.
- [ ] **Step 9: `VENDOR.md`:** upstream URL, version `1.0.11`, commit `1980fbb`, what was copied and left out, the import rewrite, every later change (with reason), and "How to update" (copy the new tag over, re-run the rewrite, re-apply listed changes, run the smoke test and the web check).
- [ ] **Step 10:** `pnpm typecheck` passes with the vendored code included (fix type errors in the copy only if our tsconfig is stricter than upstream's; list them in `VENDOR.md`). `pnpm test:frontend` passes. Commit "Vendor HeroUI Native behind @ui".

---

### Task 4: Lint, format and layer boundaries

**Files:**
- Create: `frontend/eslint/layer-boundaries.mjs`, `frontend/eslint/layer-boundaries.test.ts`, `frontend/.prettierrc.mjs`
- Modify: root `eslint.config.js`, root `package.json` (devDeps: `eslint-plugin-react-hooks`, `@tanstack/eslint-plugin-query`, `globals` if needed), root `vitest.config.ts` (unit project includes `frontend/eslint/**/*.test.ts`), root `.prettierignore` (`frontend/src/ui/heroui`), `frontend/package.json` (Prettier plugins)

**Interfaces:**
- Produces: `layerBoundaryConfigs(): Linter.Config[]` exported from `layer-boundaries.mjs`, spread at the end of the root config.

- [ ] **Step 1: Failing tests** `frontend/eslint/layer-boundaries.test.ts` (Vitest, root unit project). Use `new ESLint({ cwd: <repo root> })` and `lintText(code, { filePath })`; assert on `no-restricted-imports` / `no-restricted-properties` messages. Cases (each `filePath` under `frontend/src/`):
  - `helpers/auth/auth.helpers.ts` importing `@api/http-client` → error mentioning `"helpers" layer must not import from "api"`.
  - `stores/auth/auth.store.ts` importing `@queries/auth` → error.
  - `queries/auth/auth.mutations.ts` importing `@stores/auth` → error.
  - `components/x/x.tsx` importing `@api/auth` → error.
  - `modules/auth/screens/login-screen/login-screen.tsx` importing `@modules/home/navigation/home-navigator` → error mentioning `Module "auth"`.
  - `hooks/use-auth/use-auth.ts` importing `@modules/auth/...` → error (shared layers never import modules).
  - `utils/platform/platform.utils.ts` importing `../logger` → parent-relative error.
  - `hooks/use-x/use-x.ts` importing `axios` → error (only `src/api/` imports axios); `api/http-client.ts` importing `axios` → no error.
  - `stores/x/x.store.ts` importing `react-native-mmkv` → error; `adapters/storage/storage.adapter.ts` → none.
  - `modules/home/screens/home-screen/home-screen.tsx` importing `@ui/heroui/components/button` → error; importing `@ui` → none.
  - `hooks/use-x/use-x.ts` reading `process.env.X` → error; `config/env/env.ts` → none.
  - `screens/loading-screen/loading-screen.tsx` importing `@stores/auth` and `@queries/auth` → no error (allowed).
  - a test file `helpers/auth/auth.helpers.test.ts` importing `@mocks/x` → no boundary error.
- [ ] **Step 2:** `pnpm vitest run --project unit frontend/eslint` → FAIL.
- [ ] **Step 3: Implement `layer-boundaries.mjs`**, porting blueprint §2.6 to flat config with these changes: paths are `frontend/src/...`; module names come from scanning `frontend/src/modules` at lint time; no `styles`/`ui` layer entries except that `stores`, `queries`, `helpers`, `api`, `adapters`, `utils`, `config` forbid `@ui`; `GLOBAL_LAYER_ALIAS` has no `ui` entry (it is not a layer); test files (`**/*.test.ts(x)`, `src/utils/tests/**`) are ignored by every boundary config. **Flat config replaces a rule's options when several configs match a file, so each generated config carries the complete pattern list for its files:** parent-relative + its layer's forbidden layers + (shared layer: no `@modules`) or (module: no other module) + the package rules that apply (`axios` unless under `src/api/`; `react-native-mmkv` unless under `src/adapters/`; `@ui/*` unless under `src/ui/` or `src/app/`; `tailwind-variants`/`tailwind-merge` unless under `src/ui/`). Emit one base config for `frontend/src/**` (parent-relative + package rules) first, then the per-layer and per-module-layer configs. Every boundary message ends with "See frontend/ARCHITECTURE.md, 'Layers and import rules'." (the heading Task 13 writes). Also emit `no-restricted-properties` for `process.env` on `frontend/src/**` except `frontend/src/config/**`, message "Read configuration through src/config.".
- [ ] **Step 4: Root `eslint.config.js`:** ignore `frontend/android/**`, `frontend/ios/**`, `frontend/.expo/**`, `frontend/web-build/**`, `frontend/src/ui/heroui/**`; a block for `frontend/**/*.{ts,tsx}` with `react-hooks` (flat recommended), `@tanstack/query` (flat recommended), `curly: ['error', 'all']`, `@typescript-eslint/no-non-null-assertion: 'error'`, browser + RN-ish globals as needed; CommonJS + node globals for `frontend/*.js` config files; `...layerBoundaryConfigs()` last. `eslint-plugin-react` does not support ESLint 10 (peer `^9.7`): leave it out and say so in a comment.
- [ ] **Step 5:** Run the tests → PASS. `pnpm lint` passes for the whole repo.
- [ ] **Step 6: Prettier.** `frontend/.prettierrc.mjs`: `singleQuote: true` (the repo's setting), `@ianvs/prettier-plugin-sort-imports` with the blueprint §2.5 layer order (`<BUILTIN_MODULES>`, `react`, `react-native`, `<THIRD_PARTY_MODULES>`, `@airremote/contracts`, then `@app-types` → `@config` → `@utils` → `@adapters` → `@api` → `@queries` → `@stores` → `@helpers` → `@contexts` → `@hooks` → `@navigation` → `@modules` → `@screens` → `@components` → `@ui` → `@assets` → other `@` → `./`), and `prettier-plugin-tailwindcss` (last plugin) with `tailwindStylesheet: './src/ui/global.css'` and `tailwindFunctions: ['tv', 'cn']`. (`@ianvs` instead of the blueprint's `@trivago`: same ordering, works with Prettier 3 without the extra peers.) `pnpm format` then `git diff --stat` touches only `frontend/` and formatting-only changes. Commit "Lint the frontend's layer boundaries".

---

### Task 5: Infrastructure — types, utils, adapters

**Files:**
- Create: `frontend/src/types/{index.ts,api.types.ts,storage.types.ts,axios.d.ts}`, `frontend/src/utils/platform/{platform.utils.ts,index.ts,platform.utils.test.ts}`, `frontend/src/utils/logger/{logger.utils.ts,index.ts,logger.utils.test.ts}`, `frontend/src/adapters/storage/{storage.adapter.ts,index.ts}`, `.gitkeep`s for the empty layer folders
- Modify: `frontend/jest.setup.ts` (global mocks)

**Interfaces:**
- Produces:
  - `@app-types`: `ClientErrorCode = 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'REQUEST_CANCELLED' | 'UNKNOWN_ERROR'`; `ApiErrorCode = ErrorCode | ClientErrorCode` (`ErrorCode` from `@airremote/contracts`); `ApiError = { status?: number; code: ApiErrorCode; message: string; details?: { path: string; message: string }[]; isNetworkError: boolean }`; `RequestOptions = { signal?: AbortSignal }`; `KeyValueStorage` (blueprint §4.3). `axios.d.ts` augments `AxiosRequestConfig` with `skipAuth?: boolean`.
  - `@utils/platform`: `isWebPlatform`, `isIOSPlatform`, `isAndroidPlatform`, `isNativeMobilePlatform` (booleans).
  - `@utils/logger`: `logError(context: string, error: unknown): void`.
  - `@adapters/storage`: `persistStorage: KeyValueStorage` on `createMMKV({ id: 'airremote' })`.

- [ ] **Step 1: Failing tests:** `platform.utils.test.ts` — `'reports the platform jest-expo runs as'` (jest-expo's default preset is iOS: `isIOSPlatform` true, `isWebPlatform` false, `isNativeMobilePlatform` true). `logger.utils.test.ts` — `'logs the context and the error'`: spy on `console.error`, `logError('ctx', err)` → called with `'[ctx]'` and `err`.
- [ ] **Step 2:** Run → FAIL. Implement. Install `react-native-mmkv` + `react-native-nitro-modules` (pin). Check MMKV 4's web behaviour in its docs; if it does not support web, add `storage.adapter.web.ts` on `localStorage` with the same export. Run → PASS.
- [ ] **Step 3: Global mocks in `jest.setup.ts`** (blueprint §11.2, adapted): `@config/env` → `{ ENV: { appEnv: 'development', apiUrl: 'https://api.test' } }`; `@adapters/storage` → `Map`-backed `persistStorage`; `@react-native-community/netinfo` → its bundled jest mock (install the package now, it's used in Task 10); `react-i18next` → `useTranslation()` returning a `t` that echoes the key, or `"key | p: v | p2: v2"` when options are passed (ignore `ns`), plus `Trans` and `initReactI18next` stubs. Keep the Task 3 mocks.
- [ ] **Step 4:** `pnpm test:frontend`, `pnpm typecheck`, `pnpm lint` pass. Commit "Add the frontend's types, utils and storage adapter".

---

### Task 6: API layer — errors, HTTP client with refresh, auth API

**Files:**
- Create: `frontend/src/api/{api.constants.ts,servers.ts,api-error.ts,api-error.test.ts,http-client.ts,http-client.test.ts,index.ts}`, `frontend/src/api/auth/{auth.api.ts,auth.api.test.ts,index.ts}`
- Modify: `frontend/package.json` (`axios`, `zod` — same major as contracts, `@airremote/contracts: workspace:*`)

**Interfaces:**
- Consumes: `ApiError`, `RequestOptions`, `skipAuth` (Task 5); `ENV.apiUrl`.
- Produces:
  - `toApiError(error: unknown): ApiError`; `isApiError(value: unknown): value is ApiError`.
  - `type HttpClientHooks = { getAccessToken: () => string | null; refreshAccessToken: () => Promise<string>; onSessionExpired: () => void }`.
  - `createHttpClient(options: { baseURL: string; timeoutMs?: number; adapter?: AxiosAdapter }): HttpClient`, where `HttpClient` has `configure(hooks: HttpClientHooks): void` and `get(url, schema, config?)`, `post(url, body, schema, config?)`, `put(...)`, `patch(...)`, `delete(url, schema, config?)`, each resolving `z.output<typeof schema>` and rejecting `ApiError`. `noContentSchema` (accepts any body, outputs `undefined`) for 204s.
  - `http-client.ts` also exports the app's instance `httpClient = createHttpClient({ baseURL: API_URL })` and `configureHttpClient = httpClient.configure`.
  - `authApi.login(body: LoginRequest): Promise<AccessTokenResponse>`, `authApi.refresh(): Promise<AccessTokenResponse>`, `authApi.logout(): Promise<void>` — all `skipAuth: true, withCredentials: true`, paths `/auth/login`, `/auth/refresh`, `/auth/logout`.
  - Constants: `REQUEST_TIMEOUT_MS = 30_000`, `HTTP_STATUS.UNAUTHORIZED = 401`, `HTTP_HEADER.AUTHORIZATION = 'Authorization'`. (No `Interaction-Id` header and no `uuid`: the backend doesn't read one.)

- [ ] **Step 1: Failing `api-error.test.ts`:**
  - `'reads the server error envelope'`: an `AxiosError` with `response { status: 409, data: { error: { code: 'EMAIL_TAKEN', message: 'Email taken' } } }` → `{ status: 409, code: 'EMAIL_TAKEN', message: 'Email taken', isNetworkError: false }`; with `details` → details kept.
  - `'treats a request without a response as a network error'` → `code: 'NETWORK_ERROR', isNetworkError: true`, no status.
  - `'treats a cancelled request as cancelled, not offline'`: `new CanceledError()` (axios) → `code: 'REQUEST_CANCELLED', isNetworkError: false`.
  - `'falls back to UNKNOWN_ERROR for a body that is not the envelope'`: status 502, data `'<html>'` → `{ status: 502, code: 'UNKNOWN_ERROR', isNetworkError: false }`.
  - `'wraps anything else'`: `new Error('boom')` → `{ code: 'UNKNOWN_ERROR', message: 'boom', isNetworkError: false }`.
  - `'returns an ApiError unchanged'`.
- [ ] **Step 2:** Run → FAIL; implement `api-error.ts` with `errorResponseSchema.safeParse`; run → PASS.
- [ ] **Step 3: Failing `http-client.test.ts`.** Each test builds `createHttpClient({ baseURL: 'https://api.test', adapter })` where `adapter` is a `jest.fn` that answers by queue (helper in the test file: `respond(status, data)` returning an axios response, or rejecting with an `AxiosError` carrying `response` for status ≥ 400, the way axios' `settle` does). Hooks are `jest.fn`s. Cases:
  - `'resolves with the body parsed by the schema'` (schema `z.object({ id: z.string() })`, body `{ id: 'a', extra: 1 }` → `{ id: 'a' }`).
  - `'rejects with INVALID_RESPONSE when the body fails the schema'` (status 200 body `{}` → `code: 'INVALID_RESPONSE'`, `status: 200`).
  - `'sends the access token as a Bearer header'` / `'sends no Authorization header when skipAuth is set or there is no token'`.
  - `'refreshes on a 401 and retries once with the new token'`: first answer 401 `UNAUTHORIZED`, `refreshAccessToken` resolves `'new'`, second answer 200 → resolves; the retry carried `Authorization: Bearer new`; `refreshAccessToken` called once; `onSessionExpired` not called.
  - `'refreshes once for concurrent 401s'`: two requests both answered 401, then 200, 200 → `refreshAccessToken` called once, both resolve.
  - `'ends the session once when the refresh fails'`: two concurrent 401s, `refreshAccessToken` rejects → both reject with the original 401 `ApiError` (`code: 'UNAUTHORIZED'`), `onSessionExpired` called exactly once.
  - `'does not refresh again when the retried request gets a 401'`: 401, refresh ok, 401 → rejects, `refreshAccessToken` called once, `onSessionExpired` called once.
  - `'never refreshes a skipAuth request'`: 401 on a `skipAuth` post → rejects, no hook called.
  - `'never refreshes a request that carried no token'`: `getAccessToken` returns null, 401 → rejects, no refresh.
  - `'does not refresh a cancelled request'`: request with an already-aborted `AbortController` signal → rejects `REQUEST_CANCELLED`, no refresh.
  - `'passes a 204 through noContentSchema'` → resolves `undefined`.
- [ ] **Step 4:** Run → FAIL. Implement `createHttpClient`: one axios instance per client; request interceptor adds the header from `hooks.getAccessToken()` unless `skipAuth`, and remembers on the config whether a token was sent; response interceptor implements the refresh (single in-flight `Promise<string> | null` cleared when settled; a per-config retried flag; a 401 on a retried request calls `onSessionExpired` and rejects). Methods parse `response.data` with the schema (`safeParse`; failure → `ApiError` `INVALID_RESPONSE` with the status and Zod's issue paths in `details`). Run → PASS.
- [ ] **Step 5: Failing `auth.api.test.ts`** with `jest.mock('@api/http-client')`: `login` posts `/auth/login` with the body, `accessTokenResponseSchema`, and `{ skipAuth: true, withCredentials: true }`, returns what the client resolves; same shape for `refresh` (body `undefined`) and `logout` (`noContentSchema`). Run → FAIL, implement, PASS.
- [ ] **Step 6:** `pnpm test:frontend && pnpm typecheck && pnpm lint`. Commit "Add the frontend's HTTP client, refreshing on 401".

---

### Task 7: Server state — query client and auth mutations

**Files:**
- Create: `frontend/src/types/react-query.d.ts`, `frontend/src/queries/{query-client.ts,query-client.test.ts,queries.constants.ts}`, `frontend/src/queries/auth/{auth.queries.ts,auth.mutations.ts,auth.mutations.test.tsx,index.ts}`, `frontend/src/utils/tests/{tests.utils.tsx,index.ts}`

**Interfaces:**
- Consumes: `authApi` (Task 6), `ApiError`.
- Produces:
  - `Register` augmentation: `defaultError: ApiError`, `queryMeta`/`mutationMeta`: `{ errorMessage?: string; silent?: boolean; blocking?: boolean }` (blueprint §6.1).
  - `createQueryClient(onApiError?: (error: ApiError, fallbackMessage?: string) => void): QueryClient` — blueprint §6.2 plus: errors with `code === 'REQUEST_CANCELLED'` are never passed to `onApiError`; no retry for 4xx or `INVALID_RESPONSE`. Constants `DEFAULT_STALE_TIME_MS = 30_000`, `DEFAULT_GC_TIME_MS = 300_000`, `MAX_QUERY_RETRIES = 2`.
  - `authKeys = { all: ['auth'] as const }`; `useLoginMutation()` (variables `LoginRequest`, data `AccessTokenResponse`), `useRefreshSessionMutation()` (no variables, `meta: { silent: true }`), `useLogoutMutation()` (`meta: { silent: true }`). Mutation keys `[...authKeys.all, 'login' | 'refresh' | 'logout']`. No store access.
  - `@utils/tests`: `createTestQueryClient()`, `createQueryWrapper(client?)` (wraps `QueryClientProvider` + `UiProvider`), `renderWithProviders(ui, { queryClient? })`, re-export of `@testing-library/react-native` (blueprint §11.3).

- [ ] **Step 1: Failing `query-client.test.ts`:** using `client.fetchQuery` / `client.getMutationCache().build(...).execute()` with a `jest.fn` `onApiError`:
  - `'reports a failed query with its meta.errorMessage'`; `'does not report a silent query'`; `'reports a failed mutation'`; `'does not report a cancelled request'` (queryFn rejects `{ code: 'REQUEST_CANCELLED', ... }`); `'does not retry a 4xx'` (queryFn called once for status 404, with default retry delay mocked or `retryDelay: 0` via `setQueryDefaults`); `'retries a network error twice'` (called 3 times).
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Failing `auth.mutations.test.tsx`** (`jest.mock('@api/auth')`, `renderHook` + `createQueryWrapper`): `useLoginMutation` calls `authApi.login` with the credentials and exposes the token response as `data`; `useRefreshSessionMutation` calls `authApi.refresh`; `useLogoutMutation` calls `authApi.logout`; a rejected login exposes the `ApiError` as `error`.
- [ ] **Step 4:** FAIL → implement → PASS. `pnpm test:frontend && pnpm typecheck && pnpm lint`. Commit "Add the frontend's query client and auth mutations".

---

### Task 8: Client state — auth and preferences stores, auth helpers

**Files:**
- Create: `frontend/src/stores/stores.constants.ts`, `frontend/src/stores/auth/{auth.constants.ts,auth.store.ts,auth.store.test.ts,index.ts}`, `frontend/src/stores/preferences/{preferences.store.ts,preferences.store.test.ts,index.ts}`, `frontend/src/helpers/auth/{auth.helpers.ts,auth.helpers.test.ts,index.ts}`, `frontend/src/helpers/errors/{errors.helpers.ts,errors.constants.ts,errors.helpers.test.ts,index.ts}`, `frontend/src/i18n/i18n.constants.ts`

**Interfaces:**
- Produces:
  - `AUTH_STATUS = { HYDRATING: 'hydrating', AUTHENTICATED: 'authenticated', ANONYMOUS: 'anonymous', HYDRATION_FAILED: 'hydration-failed' }`, `AuthStatus`.
  - `authStore` facade (state `{ accessToken: string | null; status: AuthStatus }`, initial `{ null, HYDRATING }`, not persisted): `signIn(accessToken)` → authenticated; `setAccessToken(accessToken)` → token only; `signOut()` → `{ null, ANONYMOUS }` and resets user-scoped stores (none yet; leave the comment where they go); `startHydration()` → `{ null, HYDRATING }`; `failHydration()` → `{ null, HYDRATION_FAILED }`; `reset()`; `getAccessToken()`, `getStatus()`; `useStatus()`.
  - `STORE_PERSIST_KEY = { PREFERENCES: 'preferences-store' }`.
  - `SUPPORTED_LANGUAGE = { EN: 'en' }`, `SupportedLanguage`, `DEFAULT_LANGUAGE = 'en'`, `DEFAULT_NAMESPACE = 'messages'` (in `@i18n/i18n.constants`).
  - `preferencesStore` (persisted with `persistStorage`, `version: 1`): state `{ language: SupportedLanguage }`; `setLanguage`, `reset`, `getLanguage`, `useLanguage`.
  - `isSignedOutError(error: ApiError): boolean` — true for status 401 (any code); false for network errors, 5xx, `INVALID_RESPONSE`.
  - `GENERIC_ERROR_CODES` (`INTERNAL_ERROR`, `UNKNOWN_ERROR`, `BAD_REQUEST`, `VALIDATION_FAILED`, `INVALID_RESPONSE`) and `isGenericErrorCode(code: ApiErrorCode): boolean` — a generic code's own message loses to a query's `meta.errorMessage`.

- [ ] **Step 1: Failing tests** (`beforeEach(() => store.reset())`): `authStore` — starts hydrating with no token; `signIn` sets token + authenticated; `setAccessToken` keeps the status; `signOut` clears both; `failHydration`; `startHydration` after a failure; `useStatus` re-renders on change (`renderHook`). `preferencesStore` — defaults to `en`; `setLanguage` persists to `persistStorage` under `preferences-store`; a fresh store reading an existing persisted value (call the persist API's `rehydrate()`) restores it. Helpers — `isSignedOutError` true for `{status:401, code:'INVALID_REFRESH_TOKEN'}` and `{status:401, code:'UNAUTHORIZED'}`, false for `NETWORK_ERROR`, a 500, a 200 `INVALID_RESPONSE`; `isGenericErrorCode` true for each generic code, false for `INVALID_CREDENTIALS`.
- [ ] **Step 2:** FAIL → implement per blueprint §7.1–7.2 (facade, `INITIAL_*_STATE`, data-only state) → PASS. `pnpm test:frontend && pnpm typecheck && pnpm lint`. Commit "Add the frontend's auth and preferences stores".

---

### Task 9: Hooks — session, login, logout and shared hooks

**Files:**
- Create under `frontend/src/hooks/`: `use-auth/`, `use-session-hydration/`, `use-login/`, `use-logout/`, `use-debounced-value/`, `use-refresh-on-focus/`, `use-sync-language/`, each `use-<name>.ts`, `use-<name>.test.ts(x)`, `index.ts`; plus `use-debounced-value/use-debounced-value.constants.ts` with `DEFAULT_DEBOUNCE_MS = 300`.

**Interfaces:**
- Consumes: Tasks 7–8.
- Produces:
  - `useAuth(): { status: AuthStatus; isLoggedIn: boolean; isInitializing: boolean; hasInitializationFailed: boolean }`.
  - `useSessionHydration(): { retry: () => void }` — call **once**, in the root navigator. While status is `hydrating` it runs `useRefreshSessionMutation` once (a ref guards React StrictMode's double effect); success → `authStore.signIn(accessToken)`; error → `isSignedOutError` ? `authStore.signOut()` : `authStore.failHydration()`. `retry()` → `authStore.startHydration()` and runs it again.
  - `useLogin(): { login: (credentials: LoginRequest) => void; isLoggingIn: boolean }` — on success `authStore.signIn`.
  - `useLogout(): { logout: () => Promise<void>; isLoggingOut: boolean }` — `mutateAsync`; on failure `logError('useLogout', error)`; always then `authStore.signOut()` and `queryClient.clear()`.
  - `useDebouncedValue<T>(value: T, delayMs = DEFAULT_DEBOUNCE_MS): T`; `useRefreshOnFocus(refetch: () => unknown): void` (blueprint §6.5); `useSyncLanguage(): void` (calls `i18next.changeLanguage(language)` when `preferencesStore.useLanguage()` changes and differs from `i18next.language`).

- [ ] **Step 1: Failing tests** (mock `@api/auth`; real query client and stores; `beforeEach` resets stores):
  - `useSessionHydration`: `'signs in when the refresh succeeds'`; `'signs out when the refresh answers 401'` (status `anonymous`); `'shows the failure state when the API is unreachable'` (`NETWORK_ERROR` → `hydration-failed`); `'signs in after a retry once the API is back'` (first reject network, then resolve; `retry()` → `authenticated`); `'refreshes once under StrictMode'` (render with `{ wrapper }` that adds `React.StrictMode` → `authApi.refresh` called once); `'does nothing when not hydrating'` (status anonymous at mount → no call).
  - `useAuth`: `isInitializing` true while hydrating, `isLoggedIn` true when authenticated, `hasInitializationFailed` when failed.
  - `useLogin`: `'stores the token after logging in'`; `'stays signed out when the credentials are wrong'` (reject `INVALID_CREDENTIALS` → status unchanged, `isLoggingIn` back to false).
  - `useLogout`: `'calls the API, signs out and clears the cache'` (seed `queryClient.setQueryData(['x'], 1)` → after, `getQueryData(['x'])` undefined, status `anonymous`); `'signs out locally when the API call fails'` (reject `NETWORK_ERROR` → same outcome, `console.error` spied).
  - `useDebouncedValue` with fake timers: returns the first value, updates only after `delayMs`, restarts on a new value, clears its timer on unmount.
  - `useRefreshOnFocus`: mock `@react-navigation/native`'s `useFocusEffect` to run the callback; the first focus does not call `refetch`, the second does.
  - `useSyncLanguage`: changing `preferencesStore.setLanguage` calls `i18next.changeLanguage` (mock `i18next`).
- [ ] **Step 2:** FAIL → implement → PASS. `pnpm test:frontend && pnpm typecheck && pnpm lint`. Commit "Add the frontend's session and shared hooks".

---

### Task 10: i18n, navigation and the app root

**Files:**
- Create: `frontend/src/i18n/{config.ts,resources.ts,locales/en/{actions,messages,screens}.json}`, `frontend/src/types/{i18n.d.ts,navigation.types.ts}`, `frontend/src/utils/navigation/{navigation-ref.ts,index.ts}`, `frontend/src/navigation/{root-navigator.tsx,root-navigation-container.tsx,linking.ts}`, `frontend/src/screens/loading-screen/{loading-screen.tsx,index.ts}`, `frontend/src/screens/loading-failed-screen/{loading-failed-screen.tsx,loading-failed-screen.test.tsx,index.ts}`, `frontend/src/app/{bootstrap.ts,query-client.ts,notify-api-error.ts}`, minimal `modules/auth/navigation/auth-navigator.tsx` and `modules/home/navigation/home-navigator.tsx` with temporary screens (real screens in Task 11)
- Modify: `frontend/src/app/app.tsx`, `frontend/index.ts`, `frontend/package.json` (React Navigation 7: `@react-navigation/native`, `@react-navigation/native-stack`; `i18next`, `react-i18next`)

**Interfaces:**
- Consumes: Tasks 3, 6–9.
- Produces:
  - Navigation types: `AuthStackParamList = { Login: undefined }`, `HomeStackParamList = { Home: undefined }`, `RootStackParamList = { Auth: NavigatorScreenParams<AuthStackParamList>; Main: NavigatorScreenParams<HomeStackParamList> }`, with the global `ReactNavigation.RootParamList` augmentation. `navigationRef`, `navigateBack()`.
  - `messages.json` has `errors.<CODE>` for **every** `ErrorCode` and `ClientErrorCode` plus `errors.generic` (short, user-facing English; `REQUEST_CANCELLED` too, even though it's never shown). `actions.json`: `retry`, `sign-out`, `sign-in`. `screens.json`: `loading-failed.title`, `loading-failed.message`, `login`, `home`.
  - `notifyApiError(error: ApiError, fallbackMessage?: string): void` — `isGenericErrorCode(code)` ? `fallbackMessage ?? t(errors.<code>)` : `t(errors.<code>)`; shows `toast.error`.
  - `bootstrap(): void` — `configureHttpClient({ getAccessToken: authStore.getAccessToken, refreshAccessToken, onSessionExpired })` where `refreshAccessToken` calls `authApi.refresh()`, then `authStore.setAccessToken`, and returns the token; `onSessionExpired` = `authStore.signOut()` + `queryClient.clear()`. Wires `onlineManager`/`focusManager` on native only (blueprint §10). Imports `@i18n/config`. Does **not** hydrate (the root navigator's `useSessionHydration` does).
  - `RootNavigator`: `useSessionHydration()` + `useAuth()` + `useSyncLanguage()`; `isInitializing` → `LoadingScreen`; `hasInitializationFailed` → `LoadingFailedScreen onRetry={retry}`; else a native stack with `Main` (signed in) or `Auth`.
  - `RootNavigationContainer`: `NavigationContainer` with `ref={navigationRef}`, `linking` (`prefixes: ['airremote://']`; `Login` → `login`, `Home` → `''`), a theme from the system scheme, `documentTitle` formatter `"<title> · AirRemote"`.
  - `App`: `GestureHandlerRootView` > `SafeAreaProvider` > `QueryClientProvider` > `UiProvider` > `RootNavigationContainer`; imports `@ui/global.css`. `index.ts`: `bootstrap()` then `registerRootComponent(App)`.

- [ ] **Step 1:** i18n per blueprint §9.2 (typed `CustomTypeOptions` from `resources.en`; `resources` registers `auth` and `home` module namespaces, created in Task 11 — create their JSON files now with the keys Task 11 uses). Prove typing: add a temporary `t('nope')` in a component, `pnpm typecheck` fails, remove it.
- [ ] **Step 2: Failing `loading-failed-screen.test.tsx`:** renders `screens:loading-failed.title`'s key text and a button named `retry` (echoed key); pressing it calls `onRetry`.
- [ ] **Step 3:** FAIL → implement the screens (with `@ui` components; `LoadingScreen` shows a `Spinner`) → PASS.
- [ ] **Step 4:** Implement the rest (no tests: app and navigation layers, per the blueprint). `pnpm typecheck && pnpm lint && pnpm test:frontend` pass. Prove the navigation types: a temporary `navigation.navigate('Main', { screen: 'Nope' })` fails typecheck; remove it.
- [ ] **Step 5:** Commit "Add the frontend's i18n, navigation and app root".

---

### Task 11: Placeholder Login and Home screens, verified on web

**Files:**
- Create: `frontend/src/modules/auth/{navigation/auth-navigator.tsx,screens/login-screen/{login-screen.tsx,login-screen.test.tsx,index.ts},i18n/locales/en/auth.json}` and the module's empty folders with `.gitkeep` (`components hooks contexts stores helpers utils constants`); same for `frontend/src/modules/home/` (`home-screen` with a Sign out button using `useLogout`)
- Modify: `frontend/package.json` (`react-hook-form`, `@hookform/resolvers`)

**Interfaces:**
- Consumes: `useLogin`, `useLogout`, `@ui`, `loginRequestSchema`.

- [ ] **Step 1: Failing `login-screen.test.tsx`** (`renderWithProviders`, `jest.mock('@api/auth')`, `userEvent`):
  - `'signs in with the typed credentials'`: type into fields labelled `login.email` and `login.password`, press button `login.submit` → `authApi.login` called with `{ email, password }`; `authStore.getStatus()` becomes `authenticated`.
  - `'shows field errors and does not submit invalid input'`: email `not-an-email`, empty password, submit → `login.invalid-email` and `login.password-required` texts shown, `authApi.login` not called.
  - `'disables the button while signing in'`: login promise pending → button disabled/`busy`.
- [ ] **Step 2:** FAIL → implement: react-hook-form with `zodResolver(loginRequestSchema)`, `Controller` per field into `@ui` `TextField`; field error messages come from i18n keys (`login.invalid-email`, `login.password-required`), not Zod's text. Unstyled beyond the kit's defaults plus a centred column (`className`). Home: `home.title`, a short "signed in" text, and a `sign-out` button. → PASS.
- [ ] **Step 3: Web check against the real backend** (the spec's Verification). Put `CORS_ORIGINS=http://localhost:8081` in the local `.env`, run `pnpm dev` (API) and `pnpm --filter @airremote/frontend web`. Register a user with `curl -X POST localhost:3000/users/register -H 'content-type: application/json' -d '{"email":"web@example.com","firstName":"Web","lastName":"Check","password":"password123"}'`. With the Playwright MCP tools at `http://localhost:8081`:
  1. Starts on Login (network: `POST /auth/refresh` → 401, no CORS error in the console).
  2. Submit empty → both field errors.
  3. Wrong password → an error toast with the `INVALID_CREDENTIALS` text.
  4. Right password → Home.
  5. Reload → still Home (refresh with the cookie → 200).
  6. Sign out → Login; reload → Login.
  7. Phone width (390×844) renders without horizontal scroll.
  Screenshots of Login, the toast and Home. Console clean (no errors; warnings from the vendored kit listed in the report).
- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm test` (whole repo). Commit "Add placeholder Login and Home screens".

---

### Task 12: The `create-new` generator

**Files:**
- Create: `frontend/scripts/create-new.mjs`, `frontend/scripts/templates/*.mjs` (one module per kind, exporting functions that return file contents), `frontend/scripts/create-new.test.ts` (Jest, Node environment via `@jest-environment node` docblock)
- Modify: `frontend/package.json` (`"create-new": "node scripts/create-new.mjs"`)

**Interfaces:**
- Produces: `pnpm --filter @airremote/frontend create-new <kind> [name] [--module <m>] [--persisted]`, kinds `component | screen | hook | store | domain | helper | module`. Exports `generate({ kind, name, module, persisted, root }): { files: string[]; notes: string[] }` for tests; the CLI prompts (Node `readline/promises`) for anything missing and prints `notes` (lines the user must add by hand, e.g. `resources.ts` entries).

Templates follow this design, not the blueprint's literal code: Tailwind `className` (no `.styles.ts`), tests next to the file, API methods taking a contract schema, query keys/options + mutation hooks, store facade with `INITIAL_*_STATE`/`reset()` (persisted adds a `STORE_PERSIST_KEY` entry and `version: 1`), module skeleton with `.gitkeep`s and `i18n/locales/en/<m>.json`. Domain: `api/<d>/<d>.api.ts` + test + index, `queries/<d>/<d>.queries.ts`, `<d>.mutations.ts` + test + index. (No `types/<d>.types.ts`: domain types come from `@airremote/contracts`.)

- [ ] **Step 1: Failing tests** in `create-new.test.ts` against a temp copy root (`fs.mkdtempSync`, with a minimal `src/modules/` and `src/stores/stores.constants.ts`):
  - `'turns PascalCase into kebab-case files'`: `component ProductCard` → `src/components/product-card/{product-card.tsx,product-card.test.tsx,index.ts}`, the component named `ProductCard`.
  - `'puts module files inside the module'`: `hook PairingCode --module devices` → `src/modules/devices/hooks/use-pairing-code/...` and a line appended to `src/modules/devices/hooks/index.ts`.
  - `'refuses to overwrite'`: running twice throws/exits non-zero with a message naming the path.
  - `'fails for a module that does not exist'`.
  - `'adds a persist key for a persisted store'`.
  - `'prints the resources.ts lines for a new module'`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Real-output check:** in `frontend/`, generate one of each kind (`module scratch`, then `component ScratchCard --module scratch`, `screen Scratch --module scratch`, `hook Scratch --module scratch`, `store Scratch --module scratch --persisted`, `helper Scratch`, `domain scratch`), add the printed lines by hand, run `pnpm lint && pnpm typecheck && pnpm test:frontend` → all pass. Then delete every generated file and revert the hand-added lines (`git status` clean apart from the generator). Commit "Add the frontend's create-new generator".

---

### Task 13: Docs — ARCHITECTURE.md, README and CLAUDE.md

**Files:**
- Create: `frontend/ARCHITECTURE.md`, `frontend/README.md`
- Modify: root `CLAUDE.md` (new "Frontend conventions" section after "Firmware conventions"; the intro line stays), root `README.md` only if it lists folders that changed (it doesn't need a new row unless the table describes V2 folders — leave it)

- [ ] **Step 1: `frontend/ARCHITECTURE.md`** — written for this project (no BOX, no RxJS): the stack table; the directory tree (File structure above); the layer diagram, table and extra rules (blueprint §2.3, adjusted: contracts usable by every layer, `@ui` only, package rules from Task 4); state ownership (§2.4) with the "never copy server data into a store" rule; naming (§2.5, adjusted for Tailwind and tests next to files); the API layer (ApiError, schema-validated client, the refresh flow as a numbered list with the single-flight and retried-once rules, cookies and `withCredentials`); auth states and transitions; the query conventions (§6.6) and store facade rules (§7.1); i18n and error messages by code; the vendored kit (`VENDOR.md`); the blueprint's pitfalls (§17 items 1–12; item 12 points at `@utils/platform`). It must have a "Layers and import rules" heading: the ESLint messages from Task 4 point there.
- [ ] **Step 2: `frontend/README.md`** — like `backend/README.md`: prerequisites (Node 24, pnpm 10, for Android: Android Studio with SDK + JDK 17 — Java 25 is too new; iOS only on a Mac or EAS); env files and `.env.local` overrides (emulator `http://10.0.2.2:3000`, phone `http://<LAN-IP>:3000`, and that a phone's origin needs no CORS while web needs `CORS_ORIGINS`); commands (`web`, `android`, `ios`, `prebuild`, `test`, `create-new`); **manual native checklist** from the spec's Verification (install a dev build, sign in, Home, background/foreground, airplane mode, wait 10 minutes then use the app, kill and reopen the app — still signed in (cookie persistence), sign out); common failures.
- [ ] **Step 3: Root `CLAUDE.md` "Frontend conventions"** — as short as the backend section: `frontend/` is an Expo app (dev builds; `android/`/`ios/` generated, not committed); the layers and that ESLint enforces imports (no `../`, no cross-module, shared layers never import modules, only `src/api` imports axios, only `src/adapters` imports MMKV, only `src/config` reads `process.env`, app code imports `@ui` only); server state in TanStack Query, client state in Zustand, never server data in a store; every response validated with `@airremote/contracts`; errors shown by code from i18n; the vendored kit and `VENDOR.md`; tests next to the file (Jest, `pnpm test:frontend`, part of `pnpm test` and `pnpm test:unit`) — note this differs from the backend's `__tests__/` rule, and adjust the Testing section's "Every folder that holds source files has a `__tests__/` folder" to say it applies outside `frontend/`; `create-new`; "details in `frontend/ARCHITECTURE.md`; recipes in the `frontend-*` skills".
- [ ] **Step 4:** `grep -n "Layers and import rules" frontend/ARCHITECTURE.md` finds the heading the ESLint messages name; `pnpm lint` passes. Commit "Document the frontend's architecture".

---

### Task 14: Claude Code skills

**Files:**
- Create: `.claude/skills/<name>/SKILL.md` for the nine skills below.

Each `SKILL.md` has frontmatter `name` and `description` (third person, starts with "Use when …", names the triggers: the folders and kinds of change), then: when to use it, the steps as a checklist, the rules that matter for that kind of change (one line each, pointing at the `ARCHITECTURE.md` heading for the why instead of repeating it), a short example drawn from the code that now exists (e.g. `api/auth`, `stores/auth`, `use-login`) or from AirRemote's real domains (devices, remotes, buttons, device commands — never products/BOX), and the verification commands (`pnpm lint && pnpm typecheck && pnpm test:frontend`). Each under ~150 lines.

| Skill | Covers | Description must trigger on |
| --- | --- | --- |
| `frontend-feature` | A feature end to end (blueprint §15.1 adapted): contract check (is the endpoint in `@airremote/contracts`?), `create-new domain` / `module`, API → queries → module state (only if needed) → helpers → hooks → components → screens → navigator → param list → root registration → i18n → tests | adding a screen/flow/feature to the app, porting a V1 page |
| `frontend-api` | API object + query keys/options + mutation hooks for a backend domain; schemas from contracts; `RequestOptions` signal; cache effects in hooks, UI effects at the call site; polling a device command with `refetchInterval`; key factories; empty constants | anything in `src/api` or `src/queries`, calling a new endpoint |
| `frontend-ui` | Components, screens, navigators; `@ui` and Tailwind classes with theme tokens; one component per file; sub-components; conditional rendering rule; adding an export to `src/ui/index.ts`; changing the vendored kit and recording it in `VENDOR.md`; porting V1's look | `src/components`, `src/screens`, `modules/*/components|screens|navigation`, `src/ui` |
| `frontend-state` | Where state lives (the §2.4 table); global/module store facade; scoped store + context; hooks composing queries and stores; persisted stores and `version`/`migrate`; `useShallow`; facade-hook call rules | `src/stores`, `modules/*/stores`, `contexts`, `hooks` |
| `frontend-logic` | Helpers (grouped object vs functions, purity, one-way dependencies header) and constants (frozen `as const` enums, naming, locations) | `src/helpers`, `*.constants.ts` |
| `frontend-platform` | `.web.ts`/`.native.ts`/`.ios.ts`/`.android.ts` files with identical exports, adapters for native libraries, `@utils/platform`, web differences (cookies and `withCredentials`, CORS) | platform-specific code, a new native library |
| `frontend-i18n` | Namespaces (global vs module), registering in `resources.ts`, typed keys, interpolation, error messages by code (adding an `ErrorCode` means adding `errors.<CODE>`), adding a language | translations, user-facing text, new error codes |
| `frontend-testing` | What to test per layer (§11.4 table), mock at the API boundary, real query client per test, store resets, `renderWithProviders`, accessible queries, the i18n mock's echo format, fake timers, no sleeps | writing or fixing frontend tests |
| `frontend-dev` | Running: env files and `.env.local`, `pnpm dev` + `CORS_ORIGINS` for web, `web`/`android`/`ios`, dev builds and `prebuild`, EAS for iOS, emulator/phone API URLs, verifying a change in the browser with the Playwright MCP tools, the manual native checklist, common failures | running, debugging or checking the app by hand |

- [ ] **Step 1:** Write the nine skills.
- [ ] **Step 2:** Check each: frontmatter parses (`name` matches the folder), every file path and command it names exists (`grep` them), and no skill contradicts `ARCHITECTURE.md` or `CLAUDE.md` (read them side by side).
- [ ] **Step 3:** Commit "Add the frontend skills".

---

### Task 15: Final verification

- [ ] **Step 1:** From a clean install (`pnpm install --frozen-lockfile`): `pnpm lint`, `pnpm typecheck`, `pnpm test` (the whole repo: Vitest projects incl. integration/e2e/firmware, then Jest). Report counts.
- [ ] **Step 2:** `pnpm --filter @airremote/frontend exec expo-doctor` passes; `EXPO_PUBLIC_APP_ENV=development pnpm --filter @airremote/frontend exec expo prebuild --no-install --clean` generates `android/` and `ios/` with ids `com.airremote.app.dev`, then delete them (they're git-ignored; `git status` clean).
- [ ] **Step 3:** Re-run Task 11's web walkthrough on the final tree (quick pass: Login → wrong password toast → Home → reload → sign out), console clean.
- [ ] **Step 4:** Deliberate-violation spot check by hand (Task 4's tests already cover it): add `import { httpClient } from '@api/http-client'` to `src/helpers/auth/auth.helpers.ts`, `pnpm lint` fails, revert.
- [ ] **Step 5:** `grep -ri "box\|merchant\|products" frontend .claude/skills --include=*.{ts,tsx,md,mjs,json}` finds no blueprint leftovers (the word "products" may appear only if genuinely about AirRemote).
- [ ] **Step 6:** Report to the owner: what was built, the manual native checklist they need to run (from `frontend/README.md`), anything in `VENDOR.md`, deviations from the plan.
