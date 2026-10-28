---
name: frontend-platform
description: Use when frontend/ code must behave differently on web, iOS or Android (a .web.ts, .native.ts, .ios.ts or .android.ts file, a Platform.OS check), when adding a native library or anything in src/adapters, or when something works on native but not in the browser (cookies, CORS, focus, connectivity).
---

# Platform differences and native libraries

The app runs on Android, iOS and web (react-native-web). Most code is shared;
the differences are kept in a few known places.

## Branching on the platform

- [ ] A value or a small branch: the flags from `@utils/platform`
      (`isWebPlatform`, `isIOSPlatform`, `isAndroidPlatform`,
      `isNativeMobilePlatform`). Never `Platform.OS` scattered around →
      [Platform differences][platform], [Pitfalls][pitfalls].
- [ ] A whole implementation: platform files side by side. Always keep a
      base `x.ts` (usually the native implementation), then add `x.web.ts`,
      `x.ios.ts` or `x.android.ts` next to it, with **identical exports and
      types**. TypeScript resolves only the base file (`tsconfig.json` has no
      `moduleSuffixes`), so `x.native.ts` + `x.web.ts` without an `x.ts`
      fails `pnpm typecheck`; nothing checks that the variants match, so type
      both with one type from `src/types/`. Metro picks the file at bundle
      time; consumers import the folder alias (`@adapters/x`), never a
      platform file.
- [ ] Component variants follow the same rule (`<name>.web.tsx` next to
      `<name>.tsx`), only when web truly needs a different implementation.
- [ ] Test the shared contract once; test a platform file's own behaviour in
      its own test next to it.

## Adding a native library

- [ ] Install from `frontend/` with `pnpm expo install <package>` (Expo picks
      the version for SDK 58), then pin the exact version in
      `frontend/package.json`, as every dependency is. Check with
      `pnpm exec expo-doctor`.
- [ ] Put it behind an adapter in `src/adapters/<topic>/<topic>.adapter.ts`
      (+ `.web.ts` if web differs), typed with an app type in `src/types/`,
      exported from the folder's `index.ts` → [Platform differences][platform].
      A library that draws UI goes behind a wrapper in `src/ui/<name>/`
      instead, exported from `@ui` (`expo-image` → `Image`, `expo-camera` →
      `QrScanner` and `useCameraAccess`, `expo-linear-gradient` →
      `LinearGradient`) → [UI kit][ui].
- [ ] Restrict the package to `src/adapters/` (or `src/ui/`) in
      `PACKAGE_RULES` of `frontend/eslint/layer-boundaries.mjs`, as
      `react-native-mmkv` and `expo-camera` are, and add the case to
      `frontend/eslint/layer-boundaries.test.ts`.
- [ ] Give Jest a stand-in: mock the adapter in `frontend/jest.setup.ts` (the
      storage adapter is an in-memory map there), the library's own Jest
      mock, or a file in `frontend/mocks/` mapped in `jest.config.js`
      (`expo-camera.mock.tsx`, a camera tests can drive).
- [ ] Native code changed, so rebuild the development build: `pnpm prebuild`
      (regenerates the git-ignored `android/` and `ios/`), then
      `pnpm android` / `pnpm ios`; a running `pnpm start` is not enough.
      Add a step to the manual checks in `frontend/README.md` if the
      behaviour can only be seen on a device.

## Rules

- Adapters import no presentation, stores, queries, helpers, api or `@ui`;
  only `src/adapters` imports `react-native-mmkv` →
  [Layers and import rules][layers].
- Only `src/config` reads `process.env`; platform-dependent config is still
  read there → [Layers and import rules][layers].
- Web cookies: the refresh cookie needs `withCredentials` on the `/auth`
  calls (`COOKIE_CALL` in `src/api/auth/auth.api.ts`) and the API must list
  `http://localhost:8081` in `CORS_ORIGINS`; native stacks keep the cookie
  themselves → [Cookies][cookies].
- Focus and connectivity: browsers report both to TanStack Query; on native
  `src/app/bootstrap.ts` wires NetInfo and `AppState`. Don't add listeners of
  your own; use `useRefreshOnFocus(refetch)` on screens →
  [Queries][queries].
- Native requests need no CORS; an emulator or phone reaches the API through
  `EXPO_PUBLIC_API_URL` in `frontend/.env.development.local`
  (`frontend-dev`).

## Example: the storage adapter

`src/adapters/storage/storage.adapter.ts` wraps MMKV in the app's
`KeyValueStorage` type (`src/types/storage.types.ts`); stores use
`persistStorage` and never see MMKV. MMKV 4 falls back to `localStorage` on
web itself, so this adapter needs no `.web.ts`. A library without web
support would get `<topic>.adapter.web.ts` with the same exports:

```ts
// src/adapters/haptics/haptics.adapter.ts      (native: the library)
export const haptics = { tap: () => impactAsync(ImpactFeedbackStyle.Light) };
// src/adapters/haptics/haptics.adapter.web.ts  (web: nothing to do)
export const haptics = { tap: () => Promise.resolve() };
```

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

Then check web in the browser and, for native-only behaviour, the manual
device checks (`frontend-dev`).

[platform]: ../../../frontend/ARCHITECTURE.md#platform-differences
[pitfalls]: ../../../frontend/ARCHITECTURE.md#pitfalls
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[cookies]: ../../../frontend/ARCHITECTURE.md#cookies
[queries]: ../../../frontend/ARCHITECTURE.md#queries
[ui]: ../../../frontend/ARCHITECTURE.md#ui-kit
