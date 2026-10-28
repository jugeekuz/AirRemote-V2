# Frontend architecture

This is the contract for `frontend/`: where code goes, what it may import,
who owns which state, and how the API, auth, errors and the UI kit work.
ESLint enforces the import rules; the rest is checked in review. Commands and
setup are in `frontend/README.md`.

## Stack

Versions are pinned exactly in `frontend/package.json`.

| Concern      | Choice                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Framework    | React Native on Expo SDK 58, development builds (not Expo Go), TypeScript strict                            |
| Platforms    | Android, iOS, web (react-native-web through Expo's Metro web)                                               |
| Navigation   | React Navigation 7, native stack, dynamic API, typed param lists                                            |
| Server state | TanStack Query 5                                                                                            |
| Client state | Zustand 5                                                                                                   |
| HTTP         | axios, wrapped in one `httpClient` that validates every response                                            |
| Contracts    | `@airremote/contracts` (Zod schemas shared with the backend)                                                |
| Forms        | react-hook-form with the Zod resolver                                                                       |
| i18n         | i18next + react-i18next, typed keys, a namespace per module                                                 |
| Persistence  | react-native-mmkv 4 behind the storage adapter (synchronous; localStorage on web)                           |
| UI kit       | HeroUI Native 1.0.11, vendored in `src/ui/heroui/`, styled with Tailwind 4 classes through Uniwind          |
| Env config   | `EXPO_PUBLIC_*` variables from committed `.env.*` files, validated with Zod in `src/config/env`             |
| Imports      | `tsconfig.json` `paths` is the one alias list: Metro reads it, `jest.config.js` builds its mapper from it   |
| Lint, format | Root ESLint (typescript-eslint, react-hooks, TanStack Query, the layer rules); Prettier with import sorting |
| Tests        | Jest through jest-expo, @testing-library/react-native 14                                                    |

`eslint-plugin-react` is not used: it does not support ESLint 10.

## Directory structure

```
frontend/
├── app.config.ts          Expo config: name, app ids (.dev in development), scheme
├── index.ts               runs bootstrap(), then registers App
├── .env.development       committed, non-secret EXPO_PUBLIC_* values
├── .env.production
├── metro.config.js        Expo's Metro config wrapped by Uniwind
├── jest.config.js  jest.setup.ts  jest.resolver.js
├── tsconfig.json          strict; `paths` holds the import aliases
├── .prettierrc.mjs        import order by layer, Tailwind class order
├── eslint/                layer-boundaries.mjs (the import rules) and its test
├── mocks/                 file.mock.ts (CSS, images and fonts in Jest),
│                          expo-camera.mock.tsx (a camera tests can drive)
├── scripts/               create-new.mjs (scaffolding) and templates/
├── assets/                app icons and favicon (app.config.ts)
└── src/
    ├── app/          composition root: app.tsx, bootstrap.ts, query-client.ts, notify-api-error.ts
    ├── navigation/   root-navigation-container.tsx, root-navigator.tsx, main-tabs.tsx, linking.ts
    ├── screens/      app-level screens: loading-screen/, loading-failed-screen/
    ├── components/   shared components (see Shared components)
    ├── hooks/        use-auth/, use-session-hydration/, use-login/, use-logout/,
    │                 use-debounced-value/, use-refresh-on-focus/, use-sync-language/,
    │                 use-device-command/
    ├── contexts/     edit-mode/
    ├── stores/       stores.constants.ts, auth/, preferences/, pending-pairing/
    ├── queries/      query-client.ts, queries.constants.ts, and one folder per domain:
    │                 auth/, users/, devices/, remotes/, buttons/, device-commands/
    ├── helpers/      auth/, device-commands/, errors/, i18n/
    ├── api/          http-client.ts, api-error.ts, api.constants.ts, servers.ts, and one
    │                 folder per domain: auth/, users/, devices/, remotes/, buttons/,
    │                 device-commands/
    ├── adapters/     storage/
    ├── utils/        layout/, logger/, navigation/, platform/, tests/
    ├── config/       env/
    ├── i18n/         config.ts, i18n.constants.ts, resources.ts, locales/en/*.json
    ├── ui/           index.ts (@ui), global.css, theme.css (V1's look), ui-provider/,
    │                 alert/, toast/, icon/, image/, linear-gradient/, modal/, qr-scanner/,
    │                 tick/, tinted-spinner/, heroui/ (vendored),
    │                 uniwind-types.d.ts (generated by Metro, committed)
    ├── assets/       images.ts (IMAGES) and V1's pictures and icons
    ├── types/        index.ts (@app-types), api.types.ts, navigation.types.ts, pairing.types.ts,
    │                 storage.types.ts, assets.d.ts, axios.d.ts, react-query.d.ts, i18n.d.ts
    └── modules/
        ├── auth/     Login and Sign up
        ├── devices/  the device list and the Add device wizard
        └── remotes/  the remote list, the Add remote wizard and a remote's details
                      (buttons, learning, pressing)
```

A module (one feature) has `components/`, `constants/`, `contexts/`,
`helpers/`, `hooks/`, `stores/`, `utils/`, `screens/<name>-screen/`,
`navigation/<module>-navigator.tsx` and `i18n/locales/<lng>/<module>.json`.
An empty folder holds a `.gitkeep`.

`api/` and `queries/` are global and organised by backend domain
(`api/devices`, `queries/devices`), not per module: several modules read the
same data, and one module's mutation must be able to invalidate another
module's queries through the shared key factories.

`android/` and `ios/` are generated by `expo prebuild` and git-ignored.

## Layers and import rules

Dependencies flow downward only. `frontend/eslint/layer-boundaries.mjs`
turns the rules below into ESLint configs, and every message it reports
points here.

```
                  src/app — composition root, wires the layers together
                                         │
Presentation    navigation → screens → components → hooks → contexts
                                         │
State                    stores (client)         queries (server)
                            │      └──► helpers ◄──┘     │
                            │              │             │
Data, platform          adapters       constants        api
                            └──────────► utils ◄─────────┘
Infrastructure                           config

Every layer: types (@app-types), @airremote/contracts, i18n constants, assets
```

The table lists what ESLint forbids for each layer. A layer's folders are
the global one (`src/<layer>/`) and the same folder inside every module
(`src/modules/<m>/<layer>/`). `ui` means `@ui` and `@ui/...`.

| Layer      | Purpose                                                         | Must not import                                                  | Tests              |
| ---------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| app        | Providers, bootstrap, wiring (http client ↔ auth store, errors) | (anything allowed, but see the package rules)                    | none               |
| navigation | Navigators, route gating                                        | (no layer rules; see below)                                      | none               |
| screens    | Route-level composition, thin                                   | navigation, api                                                  | optional           |
| components | Reusable UI                                                     | navigation, screens, api                                         | unit + integration |
| hooks      | Reusable stateful logic; composes queries and stores            | navigation, screens, components, api                             | unit + integration |
| contexts   | Scoped stores, providers                                        | navigation, screens, components, hooks, api                      | integration        |
| stores     | Client state (Zustand)                                          | presentation, queries, api, ui                                   | unit               |
| queries    | Server state: keys, `queryOptions`, mutation hooks              | presentation, stores, adapters, ui                               | integration        |
| helpers    | Pure business rules                                             | presentation, stores, queries, api, adapters, ui                 | unit               |
| constants  | Named values (`modules/<m>/constants/`)                         | presentation, stores, queries, helpers, api, adapters, utils, ui | none               |
| api        | HTTP only: no state, no UI, no caching                          | presentation, stores, queries, helpers, adapters, ui             | unit               |
| adapters   | Platform abstractions over native libraries                     | presentation, stores, queries, helpers, api, ui                  | optional           |
| utils      | Pure, generic, no domain knowledge                              | presentation, stores, queries, helpers, api, adapters, ui        | unit               |
| config     | Env and app config                                              | presentation, stores, queries, helpers, api, adapters, utils, ui | unit (parsing)     |

"Presentation" is navigation, screens, components, hooks and contexts. A
`*.constants.ts` file next to other code belongs to its folder's layer.
`src/types`, `src/i18n`, `src/assets` and `@airremote/contracts` are not
layers: any layer may import them. `@airremote/contracts` is pure (Zod and
types), so it is used for types and for runtime schemas alike (the Login form
validates with `loginRequestSchema`). `@app-types` holds only the app's own
types (`ApiError`, param lists, store shapes) and never re-exports contract
types.

Also enforced:

- **No parent-relative imports.** Any `..` segment (`..`, `../x`, `./../x`)
  is an error, in tests too. Use an alias (`@hooks/...`); `./` is for files
  in the same folder.
- **Modules never import other modules.** If two modules need something,
  promote it to the matching global layer.
- **Shared layers never import `@modules`.** That covers every global layer
  folder, `src/ui` and `src/types`. `src/i18n` may import only
  `@modules/<m>/i18n/...`, to register a module's namespace in
  `resources.ts`. `src/app` and `src/navigation` may import any module.
- **`src/navigation` has no layer rules of its own.** ESLint lets it import
  any layer (only the package rules apply). The convention is narrower: it
  imports screens, components, hooks, contexts, utils, types and `@ui`, and
  reads stores only to gate on auth, through `useAuth`. It never imports
  `api` or `queries`. Module navigators (`modules/<m>/navigation/`) get the
  module and package rules only.
- **Package rules:**

  | Import                                             | Only in                               |
  | -------------------------------------------------- | ------------------------------------- |
  | `axios`                                            | `src/api/**`, `src/types/axios.d.ts`  |
  | `react-native-mmkv`                                | `src/adapters/**`                     |
  | `@ui/...` sub-paths (everyone else imports `@ui`)  | `src/ui/**`, `src/app/**`             |
  | `uniwind`, `tailwind-variants`, `tailwind-merge`   | `src/ui/**`                           |
  | `expo-image` (use `Image` from `@ui`)              | `src/ui/**`                           |
  | `expo-camera` (use `QrScanner`, `useCameraAccess`) | `src/ui/**`                           |
  | `expo-linear-gradient` (use `LinearGradient`)      | `src/ui/**`                           |
  | `process.env`                                      | `src/config/**` (and `app.config.ts`) |

- **Tests are exempt** from the layer, module and package rules: files named
  `*.test.ts(x)` and everything in `src/utils/tests/`. The `../` and
  `process.env` rules still apply to them.

Module names are read from `src/modules/` when ESLint loads its config. After
creating a module, restart the editor's ESLint server so its rules apply.

Not enforced, but part of the contract:

- **Stores never fetch and queries never touch stores** (the table enforces
  the imports). They are composed in hooks or in `src/app`.
- **Helpers are pure:** no API calls, no state, no UI side effects.
- **API functions return contract types** and accept `RequestOptions`
  (`{ signal }`) so TanStack Query can cancel them.
- **Screens are thin:** they compose components and hooks.

Imports are sorted by Prettier (`frontend/.prettierrc.mjs`): packages, then
`@airremote/contracts`, then the aliases bottom-up by layer, then `./`.

## State ownership

The most important rule: each kind of state has one owner.

| Kind of state                                  | Lives in                                   | Example                                                    |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Server state (the backend owns it)             | TanStack Query cache                       | devices, remotes, buttons, a device command                |
| Global client state (app-wide, may persist)    | Zustand store in `src/stores/`             | access token and auth status, language                     |
| Client state shared by several modules         | a global Zustand store in `src/stores/`    | a pairing link waiting for sign-in (`pendingPairingStore`) |
| Module client state shared by several screens  | Zustand store in `modules/<m>/stores/`     | a list filter, a selection shown in a list and its toolbar |
| Subtree-scoped state (one per mounted subtree) | `createStore` + React Context, `contexts/` | a screen's edit mode (`@contexts/edit-mode`)               |
| Local UI state                                 | `useState` / `useReducer`                  | a dialog's visibility and step, text before debounce       |
| Form state                                     | react-hook-form                            | Login, Sign up                                             |
| Route state                                    | navigation params                          | `remoteId`                                                 |

**Never copy server data into a store or a context.** Keep ids and filters
in Zustand and read the data with a query keyed by them. A
`store.setDevices(response)` is the bug this architecture exists to prevent.

## Naming

Files and folders are kebab-case. Types are PascalCase with no `I` prefix.

| Kind                 | Location                                         | File                               | Export                        |
| -------------------- | ------------------------------------------------ | ---------------------------------- | ----------------------------- |
| Component            | `components/<name>/`                             | `<name>.tsx`                       | `default`, PascalCase         |
| Component styles     | same folder, only for what classes can't express | `<name>.styles.ts`                 | `default styles`              |
| Component types      | same folder, if large                            | `<name>.types.ts`                  | named                         |
| Screen               | `screens/<name>-screen/`                         | `<name>-screen.tsx`                | `default` `XScreen`           |
| Navigator            | `navigation/`                                    | `<name>-navigator.tsx`             | `default` `XNavigator`        |
| Hook                 | `hooks/use-<name>/`                              | `use-<name>.ts(x)`                 | named `useX`                  |
| Context              | `contexts/`                                      | `<name>.context.tsx`               | named `XProvider`, `useX`     |
| Store                | `stores/<name>/`                                 | `<name>.store.ts`                  | named facade `xStore`         |
| Query keys + options | `queries/<domain>/`                              | `<domain>.queries.ts`              | `xKeys`, `xQueries`           |
| Mutations            | `queries/<domain>/`                              | `<domain>.mutations.ts`            | `useXMutation`                |
| API                  | `api/<domain>/`                                  | `<domain>.api.ts`                  | named `xApi`                  |
| Helpers              | `helpers/<domain>/`                              | `<domain>.helpers.ts`              | named functions or `xHelpers` |
| Constants            | next to the code, or `modules/<m>/constants/`    | `<name>.constants.ts`              | `UPPER_SNAKE_CASE`            |
| Utils                | `utils/<topic>/`                                 | `<topic>.utils.ts`                 | named functions               |
| Adapter              | `adapters/<topic>/`                              | `<topic>.adapter.ts` (+ `.web.ts`) | named                         |
| Types                | `types/`                                         | `<domain>.types.ts`                | named                         |
| Tests                | next to the file                                 | `<file>.test.ts(x)`                |                               |

- Functions: `getX` returns a value, `isX`/`hasX`/`canX` a boolean, `formatX`
  a display string; `onX`/`handleX` are event handlers.
- Components, screens and navigators use `default` exports; everything else
  uses named exports.
- A component, screen, hook, store, helper, API or query folder has an
  `index.ts` with its public surface. Layer-level barrels are fine for
  `hooks`, `stores`, `helpers` and `types`; never add one for `components/`
  or `screens/` (import those by folder, e.g.
  `@modules/auth/screens/login-screen`). Navigators are imported by file.
- Constants that form a set are a frozen `as const` object
  (`AUTH_STATUS`, `STORE_PERSIST_KEY`) with a type derived from it.
- Styling is Tailwind classes (`className`) with the theme's tokens
  (`bg-background`) and Tailwind's scale. No arbitrary values (`w-[13px]`,
  hex colours), except where the scale lacks V1's value and a comment says
  so (the info card's `h-[55%]` rows).

## API layer

### `ApiError`

Every API call rejects with one shape (`src/types/api.types.ts`):
`{ status?, code, message, details?, isNetworkError }`. `code` is the
backend's `ErrorCode` or a client code: `NETWORK_ERROR`, `INVALID_RESPONSE`,
`REQUEST_CANCELLED`, `UNKNOWN_ERROR`. `toApiError` (`src/api/api-error.ts`)
turns anything thrown into it:

- an `ApiError` stays as it is;
- a cancelled request is `REQUEST_CANCELLED`;
- an axios error without a response is `NETWORK_ERROR` (`isNetworkError: true`);
- a response whose body matches `errorResponseSchema` keeps the server's
  `code`, `message` and `details`, plus the status;
- anything else is `UNKNOWN_ERROR`.

### The http client

`httpClient` (`src/api/http-client.ts`) is the only axios instance. Every
method takes the response schema and resolves with the parsed body:

```ts
httpClient.get(url, schema, config);
httpClient.post(url, body, schema, config); // also put, patch
httpClient.delete(url, schema, config);
```

- A body that fails its schema rejects with `INVALID_RESPONSE`, with the Zod
  issues as `details`. A contract drift between backend and app is a visible
  error, not a crash later. A 204 uses `noContentSchema`.
- `config` is an `HttpRequestConfig`: `signal`, `skipAuth`,
  `withCredentials` and `params`. Nothing else reaches axios.
- The base URL is `ENV.apiUrl` (`src/api/servers.ts`); the timeout is 30 s.
- One object per backend domain, `xApi` in `api/<domain>/<domain>.api.ts`,
  typed with the contract's schemas and types (see `api/auth/auth.api.ts`).
- The request interceptor adds `Authorization: Bearer <token>` unless the
  request is `skipAuth` or is the client's own retry.

### The refresh on 401

The access token lasts 10 minutes, and an expiry must be invisible to the
user. The response interceptor handles a 401 on a request that carried a
token, is not `skipAuth` and has not been retried:

1. If the user is signed out now (no current token), reject.
2. If the request's token is no longer the current one (another request
   refreshed meanwhile), retry once with the current token.
3. Otherwise refresh. All 401s that arrive while a refresh runs share it:
   the client holds one in-flight refresh. Then retry once with the new
   token.
4. If the retry is refused too, end the session, but only if its token is
   still the current one (another refused retry may already have ended it,
   or a newer token may exist). The retry rejects with its 401.
5. If the server refuses the refresh (a 401, e.g. `INVALID_REFRESH_TOKEN`),
   `onSessionExpired` runs once for that refresh, and every waiting request
   rejects with its own 401.
6. If the refresh fails for any other reason (`NETWORK_ERROR`, a 5xx,
   `INVALID_RESPONSE`), the session stays and nothing signs out: every
   waiting request rejects with the refresh's own error, so the Error
   dialog shows its code and Query retries it (a 401 would be final). A
   failure that is not an `ApiError` (e.g. signed out while refreshing)
   rejects each request with its own 401. The next 401 refreshes again. A
   dropped connection or a server restart must not sign the user out.
7. If the refresh succeeds but the request was aborted while it waited, it
   rejects with `REQUEST_CANCELLED` instead of retrying.

A 401 on a `skipAuth` request (login, refresh, logout) never refreshes.
There is no refresh before expiry; reacting to the 401 is enough.

The client never imports stores or `authApi`. `src/app/bootstrap.ts`
connects it with `configureHttpClient`, passing the hooks that
`createSessionHooks({ queryClient })` builds:

- `getAccessToken`: the auth store's token.
- `refreshAccessToken`: calls `authApi.refresh()` and stores the new token,
  but only if the user is still authenticated; if they signed out meanwhile
  it drops the token and rejects.
- `onSessionExpired`: `authStore.signOut()` and `queryClient.clear()`.

Until `configureHttpClient` runs, the client behaves as signed out.

### Cookies

The refresh token is an httpOnly cookie (`Path=/auth`, `SameSite=Strict`).
On iOS and Android the native networking stack keeps and sends it. On web,
the `/auth` calls set `withCredentials`, and the API must list the app's
origin in `CORS_ORIGINS` (see `backend/README.md`). `authApi`'s calls all
use `{ skipAuth: true, withCredentials: true }`.

## Auth

`authStore` (`src/stores/auth`) holds the access token, in memory only, and
the status. Nothing is persisted: the refresh cookie is the session.

| Status             | Meaning                                       | Root navigator shows             |
| ------------------ | --------------------------------------------- | -------------------------------- |
| `hydrating`        | restoring the session at launch               | `LoadingScreen`                  |
| `authenticated`    | signed in                                     | `Main` (the tabs, on Remotes)    |
| `anonymous`        | no session                                    | `Auth` (Login)                   |
| `hydration-failed` | couldn't restore it (offline, 5xx, bad reply) | `LoadingFailedScreen` with Retry |

Transitions:

- **Launch:** `useSessionHydration`, called once in the root navigator,
  calls refresh while the status is `hydrating`. A token → `authenticated`;
  any 401 → `anonymous`; anything else → `hydration-failed`. Retry goes back
  to `hydrating`.
- **Sign up:** the Sign up screen runs `useRegisterMutation`
  (`POST /users/register`) and goes back to Login on success, like V1; it
  does not sign in.
- **Login:** `useLogin` runs the login mutation and calls
  `authStore.signIn(token)`.
- **Logout:** `useLogout` (the account menu's "Logout") calls
  `POST /auth/logout`, then signs out locally, clears the query cache and
  drops a pending pairing link, even when the request fails (it is logged).
- **Session expired:** the http client's `onSessionExpired` does the same
  local sign-out, when the server refuses the session (a 401 on the refresh,
  or on the retry with the refreshed token). A refresh that fails for a
  transient reason (offline, 5xx) keeps the session.

The root navigator swaps the `Auth` and `Main` screens on the status; it
never navigates between them. `useAuth` gives the UI `isLoggedIn`,
`isInitializing` and `hasInitializationFailed`, from the status alone (V2
has no current-user endpoint).

Every mutation uses `networkMode: 'always'`, so offline it fails fast with
`NETWORK_ERROR` and the Error dialog says so: the launch refresh offers
Retry instead of spinning, logout still signs out, and a press, a learn, an
enrollment, a new remote or a delete is never paused and sent minutes later
when the network comes back. The device command poll
(`deviceCommandQueries.detail`) does the same, so the wait for a command
ends offline too. The list queries keep TanStack's default and pause while
offline.

`isSignedOutError` (any 401) is for the refresh and authenticated calls
only: a wrong password is a 401 too (`INVALID_CREDENTIALS`).

## Navigation

```
RootNavigator (src/navigation/root-navigator.tsx)
├── LoadingScreen / LoadingFailedScreen   while the session is restored
├── Auth   signed out: modules/auth/navigation/auth-navigator.tsx
│   ├── Login      /login
│   └── SignUp     /sign-up
└── Main   signed in: src/navigation/main-tabs.tsx, V1's bottom tab bar
    ├── Dashboard      in the bar, greyed and inert (not built)
    ├── Remotes        modules/remotes/navigation/remotes-navigator.tsx
    │   ├── RemoteList       /remotes
    │   └── RemoteDetails    /remotes/:remoteId
    ├── Devices        modules/devices/navigation/devices-navigator.tsx
    │   └── DeviceList       /devices, and /pair?mac=…&code=…
    └── Automations    in the bar, greyed and inert (not built)
```

- Every navigator hides its header; each screen draws V1's `TopToolbar`
  (`onBack` on a nested screen: RemoteDetails). Titles come from i18n and
  name the browser tab on web (`AirRemote` after them).
- The tab bar is `@components/bottom-tab-bar`, passed as `tabBar`. Main
  opens on Remotes, or on Devices when a pairing link is waiting.
- Param lists are in `src/types/navigation.types.ts`. A remote is opened by
  id (`RemoteDetails: { remoteId }`); a link to an id that isn't the user's
  shows the screen's not-found state.
- **Linking** (`src/navigation/linking.ts`): the prefix is `airremote://`
  (the scheme in `app.config.ts`); web uses the same paths. A deep link to
  `remotes/:remoteId` keeps RemoteList below it to go back to.
  `getStateFromLink(path)` is the parser: React Navigation's
  `getStateFromPath`, then the pairing link's `mac` and `code` renamed to
  DeviceList's `pairMac` and `pairCode`. DeviceList opens the Add device
  dialog at the name step with them filled in, then clears the params.
- **A pairing link opened while signed out:** the root navigator shows
  Login and drops the link's state, so `getStateFromLink` keeps a valid
  pairing in `pendingPairingStore` (`src/stores/pending-pairing`, in
  memory) whenever the status isn't `authenticated`. After sign-in Main
  opens on Devices and the device list takes it. Logout clears it.

## Queries

- `createQueryClient(onApiError)` (`src/queries/query-client.ts`) builds the
  client; `src/app/query-client.ts` makes the app's one instance with
  `notifyApiError`. Defaults: `staleTime` 30 s, `gcTime` 5 min; queries
  retry twice, but never on a 4xx, `INVALID_RESPONSE` or
  `REQUEST_CANCELLED`; mutations don't retry.
- `src/types/react-query.d.ts` types every error as `ApiError` and the
  `meta` of queries and mutations: `errorMessage` (the Error dialog's text
  for generic codes), `silent` (no dialog; the screen shows its own error)
  and `blocking`.
- Keys come from a factory (`xKeys`) and queries from `queryOptions`
  factories (`xQueries`) in `<domain>.queries.ts`. Never write a key inline.
  Factories are plain functions: no hooks in them. Pass the `signal` to the
  API.
- Mutation hooks (`useXMutation` in `<domain>.mutations.ts`) own the cache
  effects (`invalidateQueries`, `setQueryData`). UI effects (closing a
  dialog, navigating) happen at the call site. A delete invalidates in
  `onSettled`, so a 404 (already gone) drops the stale tile too.
- `src/app/bootstrap.ts` connects TanStack's online manager to NetInfo and
  its focus manager to `AppState` on native; browsers report both
  themselves. `useRefreshOnFocus(refetch)` refetches when a screen regains
  focus.
- **Polling:** `refetchInterval`, never a hand-made `setInterval`. The
  device list polls every 30 s (`DEVICE_LIST_REFETCH_MS`) for the online
  status, and only once it has data. A screen that the bottom tabs keep
  mounted reads a polled list with `subscribed: useIsFocused()`, so it
  polls only while shown (`useDeviceList`, `useRemoteList`,
  `useRemoteDetails`), and refetches on focus with `useRefreshOnFocus`.
- **Failed refetches are silent:** the query cache reports a query error
  only while the query has no data (a first load). A refetch or poll that
  fails keeps the last data on screen without a dialog. A list whose first
  load failed shows `EmptyTiles` with "Try again" (`onRetry`).
- **Device commands** (learning or pressing a button) are followed by
  `useDeviceCommand(commandId)` (`src/hooks/use-device-command`), the
  reference for a poll whose failure the user must hear about. The learn or
  press mutation seeds `deviceCommandKeys.detail(id)` with its 202 reply;
  `deviceCommandQueries.detail(id)` polls every 500 ms while the command is
  `pending` and is `meta: { silent: true }`. The hook turns the command into
  `idle | pending | succeeded | failed` (`getDeviceCommandState` in
  `@helpers/device-commands`), shows a failure's code in the Error dialog
  once per command, and gives up with `DEVICE_NOT_RESPONDING` if the
  command is still pending at its lifetime plus 5 s (after asking once
  more). It is not `subscribed: useIsFocused()`: a command is short and its
  result must arrive.
- **Push updates:** a hook subscribes and calls `setQueryData` or
  `invalidateQueries`; the cache stays the single source of truth.
- **Derived data:** the `select` option with a stable function (module-level
  or `useCallback`), not `useMemo` over `data`.
- **Empty defaults:** `data ?? EMPTY_DEVICES`, with
  `const EMPTY_DEVICES: Device[] = []` at module level. An inline `[]` is a
  new array every render.
- **Static data:** `staleTime: Infinity`.
- **Loading flags:** `isPending` means no data yet; `isFetching` means a
  request is in flight, including background ones; `isLoading` is both.
- **Blocking overlay:** `meta: { blocking: true }` is reserved for a
  `BlockingMutationOverlay` near the root (not built yet). Prefer
  `isPending` on the button that started the mutation.

### Domains

| Domain            | API (`xApi`)                                                      | Queries and mutations                                                                                                       |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `auth`            | `login`, `refresh`, `logout` (`skipAuth`, `withCredentials`)      | `useLoginMutation`, `useRefreshSessionMutation`, `useLogoutMutation`                                                        |
| `users`           | `register` (`POST /users/register`)                               | `useRegisterMutation`                                                                                                       |
| `devices`         | `list`, `enroll`, `delete`                                        | `deviceKeys`, `deviceQueries.list()` (polled), `useEnrollDeviceMutation`, `useDeleteDeviceMutation`                         |
| `remotes`         | `list` (all, with `deviceId`), `create(deviceId, body)`, `delete` | `remoteKeys`, `remoteQueries.list()`, `useCreateRemoteMutation`, `useDeleteRemoteMutation`                                  |
| `buttons`         | `list(remoteId)`, `learn(remoteId, body)`, `press(id)`, `delete`  | `buttonKeys`, `buttonQueries.list(remoteId)`, `useLearnButtonMutation`, `usePressButtonMutation`, `useDeleteButtonMutation` |
| `device-commands` | `get(id)`                                                         | `deviceCommandKeys`, `deviceCommandQueries.detail(id)` (polled while pending)                                               |

A delete takes the children with it on the server, so deleting a device
also invalidates the remote and button lists, and deleting a remote the
button lists.

## Stores

A store is a private `useXStore` and an exported facade `xStore`
(`src/stores/auth/auth.store.ts`):

- State holds data only (serializable). Actions are facade functions that
  call `setState`.
- Every store has `INITIAL_<NAME>_STATE` and `reset()`. A global store with
  data of the signed-in user is reset in `authStore.signOut()`. A module's
  store can't be (shared layers never import `@modules`): reset it in the
  cleanup of an effect in the module's entry hook, since the signed-in
  screens unmount on sign-out. State that must reset with the session itself
  belongs in a global store.
- `getX()` reads outside React; `useX()` subscribes. Each `useX()` selects
  one primitive or one stable reference; to read several fields, use
  `useShallow` from `zustand/react/shallow`. In Zustand 5 a selector that
  returns a new object or array loops forever.
- Persisted stores use `persist` with `persistStorage` from
  `@adapters/storage`, a `name` from `STORE_PERSIST_KEY`
  (`src/stores/stores.constants.ts`) and a `version`. Bump `version` and add
  `migrate` whenever the persisted shape changes. `preferencesStore` also
  has a `merge` that drops values the app no longer supports.
- Facade hooks are called as `xStore.useY()`. The rules-of-hooks lint can't
  see member calls on a lowercase object, so call them only at the top level
  of components and hooks.
- A module's store goes in `modules/<m>/stores/`. Subtree-scoped state is a
  `createStore` handed down by a provider in `contexts/`.

## i18n and error messages

- `src/i18n/config.ts` initialises i18next with bundled resources, so `t`
  works as soon as it has run; `bootstrap.ts` imports it first. English
  only, as default and fallback.
- Global namespaces live in `src/i18n/locales/<lng>/`: `actions`, `chrome`
  (the shared components: top bar, tab bar, status dot, empty grid),
  `messages` (the default namespace: errors, the dialogs' titles) and
  `screens`. Each module has one namespace,
  `modules/<m>/i18n/locales/<lng>/<m>.json`, registered in
  `src/i18n/resources.ts`.
- Keys are typed (`src/types/i18n.d.ts`): a wrong key or namespace does not
  compile. Keys are kebab-case (`sign-out`, `loading-failed.title`).
- The language is kept in `preferencesStore` (persisted); `useSyncLanguage`,
  in the root navigator, keeps i18next on it.

Errors are shown by code in V1's Error dialog: the query and mutation
caches call `notifyApiError` (`src/app/notify-api-error.ts`), which opens
`alert.error(text)` from `@ui`. Login and Sign up use it too (V1 used
`alert()`).

- The text is `messages:errors.<CODE>`. Every `ErrorCode` and
  `ClientErrorCode` must have one, or the app does not compile. Adding a
  code to the contracts' `errorCodeSchema` means adding its text to
  `src/i18n/locales/en/messages.json`.
- For a generic code (`INTERNAL_ERROR`, `UNKNOWN_ERROR`, `BAD_REQUEST`,
  `VALIDATION_FAILED`, `INVALID_RESPONSE`), the query's or mutation's
  `meta.errorMessage` is preferred when it has one.
- `errors.generic` is the fallback if a text is missing at runtime.
- The server's `message` is for developers and is never shown.
- Dialogs queue and show one at a time; an error whose text is already
  waiting is not queued again, so several queries failing for one reason
  show one dialog.
- A cancelled request shows nothing; `meta.silent` turns the dialog off
  (the screen shows its own error).
- A failed query that already has data (a refetch, a poll) shows nothing;
  only a first load that failed does (see [Queries](#queries)).
- A device command that settles as `failed` or `expired` is a 200 reply,
  not an `ApiError`: `useDeviceCommand` opens the dialog with
  `messages:errors.<CODE>` itself.
- `UNAUTHORIZED` and `INVALID_REFRESH_TOKEN` show nothing
  (`isSessionErrorCode` in `@helpers/errors`): they only reach a screen
  when the session really ended (a refresh that fails transiently rejects
  with its own error instead), and the user is taken to Login. Without
  this, a session that ends would open a dialog per query in flight. Other
  401s (a wrong password is `INVALID_CREDENTIALS`) show as usual.
- Form fields show their own i18n texts, not Zod's messages (see
  `StackedField` on Login and Sign up, `BorderedField` in the wizards).

## UI kit

- HeroUI Native 1.0.11 is vendored in `src/ui/heroui/`: we own the copy. It
  is excluded from ESLint, Prettier and coverage, but type-checked.
  `src/ui/heroui/VENDOR.md` records the upstream commit, every change made
  to it and how to update it; record any change you make there.
- `src/ui/index.ts` is the app's only entry to the kit: app code imports
  `@ui`. Re-export a kit component there when a screen first needs it.
  `Text` is the kit's `Typography`.
- `UiProvider` holds the gesture root, the kit's provider (theme, portals,
  toasts) and the bridges behind `alert` and `toast`. It must sit inside
  `SafeAreaProvider` (`src/app/app.tsx`).
- `alert` from `@ui` opens V1's dialogs from anywhere, outside React too:
  `alert.error(message)` (the "Error" dialog with OK) and
  `alert.confirm({ title, message, confirmLabel, cancelLabel })`, which
  resolves `true` only on the confirm button (the delete badges use it).
  Without a mounted `UiProvider` an error is dropped and a confirmation
  resolves `false`. `toast` still exists but nothing uses it.
- **Theme:** V1 is light-only, so the app is: `UiProvider` fixes Uniwind's
  theme to light and `app.config.ts` sets `userInterfaceStyle: 'light'`.
  `src/ui/global.css` imports Tailwind, Uniwind, the kit's styles and then
  `src/ui/theme.css`, which holds V1's values: Tailwind 3's hex palette
  (gray, zinc, green, blue, ...; Tailwind 4's OKLCH one differs), the
  kit's tokens with NextUI's light values (the accent is black, as V1's
  `primary`), `secondary`, NextUI's radii (`rounded-small/medium/large`)
  and shadows. Every class, colour, size and text of V1's screens is in
  `docs/superpowers/specs/2026-10-28-v1-look-inventory.md`. A change to
  `theme.css` needs the dev server restarted with `--clear`.
- **Fonts:** the system font, except where V1 named Poppins (empty states,
  loading text): `font-poppins`, `font-poppins-medium`,
  `font-poppins-semibold` (one family per weight, as native needs).
  `src/app/app.tsx` loads them with `expo-font`; the app shows the loading
  screen until they load (or fail, falling back to the system font).
- **Wrappers** in `src/ui`, because only `src/ui` may import the packages
  behind them (see the package rules):

  | `@ui` export                   | Wraps                                 | Use                                                                 |
  | ------------------------------ | ------------------------------------- | ------------------------------------------------------------------- |
  | `Icon`                         | `lucide-react-native` + Uniwind       | an icon coloured with a class (`colorClassName`); decorative        |
  | `Image`                        | `expo-image`                          | a picture from `@assets/images` (`IMAGES`), styled with `className` |
  | `LinearGradient`               | `expo-linear-gradient`                | V1's `bg-gradient-to-*` with Tailwind colours                       |
  | `Modal`                        | the kit's `Dialog`                    | V1's wizards: `Modal.Header`, `.Body`, `.Footer`, `.Button`         |
  | `QrScanner`, `useCameraAccess` | `expo-camera`                         | the pairing code scanner and the camera permission                  |
  | `Tick`, `TintedSpinner`        | `react-native-svg`, the kit's spinner | the press control's tick and grey spinner                           |

- Link a `Label` to its `Input` with `nativeID` on the label and
  `aria-labelledby` on the input, both from `useId()` (`BorderedField`,
  `StackedField`).
- react-native-web ignores `accessibilityState`: a busy or disabled
  control also sets `aria-busy` / `aria-disabled` (and a tab
  `aria-selected`) so browsers see it (`modules/auth/components/submit-button`).

## Shared components

`src/components/` holds V1's chrome, used by every signed-in screen:

| Component               | What it is                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| `Screen`                | every screen's container, clear of the status bar and notch                |
| `TopToolbar`            | the short logo (or Back, `onBack`) and the account menu                    |
| `BottomTabBar`          | V1's tab bar; Dashboard and Automations greyed and inert                   |
| `SectionHeader`         | a grid's title with its count badge and the "+ \| ✎" pill (add, edit mode) |
| `NoticeBox`             | the green notice under a header                                            |
| `TileGrid`              | V1's columns by window width (2 on phones, up to 10)                       |
| `EmptyTiles`            | the empty grid, or "Try again" (`RetryButton`) with `onRetry`              |
| `StatusDot`             | V1's glossy green or red dot                                               |
| `DeleteBadge`           | the edit-mode × on a tile's corner; asks V1's confirmation first           |
| `Wobble`                | V1's edit-mode shake around a tile                                         |
| `FlatSelect`            | V1's flat NextUI select (the Add remote wizard)                            |
| `BorderedField`         | V1's bordered input with its label inside (the wizards)                    |
| `IndeterminateProgress` | NextUI's indeterminate bar (learning a button)                             |

**Edit mode** (`@contexts/edit-mode`) is a scoped store per screen:
`EditModeProvider` wraps the screen, `useEditMode((s) => s.isEditing)`
reads it, the header's pencil calls `toggle`, and the screen calls `stop`
on blur (`useFocusEffect`), so it never survives leaving the screen. The
delete badge sits half outside its tile, so a tile's outer view is never
`overflow-hidden`. `EmptyTiles` is as tall as the window (V1's position),
so it goes inside a ScrollView. `Screen` keeps the top, left and right
clear; `hasBottomInset` adds the bottom on screens without the tab bar.
`TopToolbar`'s account menu has "Invite a friend" (disabled) and "Logout".

**Deliberate differences from V1:** the wizards have a Back button and keep
Next disabled until the step is valid; the Add device wizard's last step
has Close; there is no reordering and no rename (V2 sorts by name); a
remote that doesn't exist (deleted, or a bad link) shows a not-found state
with "Back to remotes"; the info card says "Loading.." until the device has
loaded instead of a false "Disconnected"; the press control's whole circle
is the tap target; button tiles have no "State" line.

## Platform differences

- Branch on the platform with `@utils/platform` (`isWebPlatform`,
  `isIOSPlatform`, `isAndroidPlatform`, `isNativeMobilePlatform`), or with
  platform files (`.web.ts`, `.native.ts`, `.ios.ts`, `.android.ts`) that
  export the same names.
- A native library goes behind an adapter in `src/adapters/`; one that
  draws UI (`expo-image`, `expo-camera`, `expo-linear-gradient`) behind a
  wrapper in `src/ui/` instead (see [UI kit](#ui-kit)).
- The camera: `useCameraAccess()` returns `access` (`checking`,
  `unavailable` when there is no camera, `undetermined`, `denied` for
  good, `granted`) and `requestAccess()`; render `QrScanner` only once it
  is `granted`. A camera that fails to start calls `onError`. The Add
  device wizard always offers "Enter manually".
- On web, the refresh cookie needs `withCredentials` and CORS (see
  [Cookies](#cookies)), and browsers report focus and connectivity to
  TanStack Query themselves.

## Testing

- Jest through jest-expo. A test sits next to its file as
  `<name>.test.ts(x)`, not in a `__tests__/` folder. `pnpm test:frontend`
  runs them; the root `pnpm test` and `pnpm test:unit` include them. The
  layer-rule tests (`frontend/eslint/layer-boundaries.test.ts`) run in the
  root Vitest unit project.
- `jest.setup.ts` mocks, for every test: `@config/env` (API URL
  `https://api.test`), the storage adapter (an in-memory map), NetInfo,
  react-i18next, `react-native-safe-area-context` and the kit's native
  modules. `jest.config.js` maps `expo-camera` to
  `mocks/expo-camera.mock.tsx`, a camera a test drives: set the permission
  with `cameraMock`, show it a code with `fireEvent(…, 'barcodeScanned', …)`
  on `CAMERA_VIEW_TEST_ID`, or fail it with `'mountError'`.
- The `t` mock echoes the key and its options: `t('key', { count: 2 })` is
  `'key | count: 2'` (`ns` is left out).
- Under fake timers, TanStack Query notifies a query's answer on a
  zero-delay timer, so timing tests advance a few ms past the moment they
  check (`use-device-command.test.ts`, `use-press-button.test.ts`).
- `@utils/tests` has `createTestQueryClient()` (one per test),
  `createQueryWrapper()` and `renderWithProviders()`, and re-exports
  @testing-library/react-native.
- Mock at the API boundary: `jest.mock('@api/<domain>')`. The http client
  itself is tested with a fake axios adapter (its `adapter` option). Use real
  query clients and stores; reset stores between tests.
- @testing-library/react-native 14's `render`, `renderHook` and `act` are
  async: `await` them.
- StrictMode runs effects twice only when `<StrictMode>` is the root
  element passed to `render`, not when it comes from a `wrapper`.
- Query by role, label or text, as a user would.

## Pitfalls

1. **A Zustand 5 selector returning a new object or array** loops forever.
   Select primitives or use `useShallow`.
2. **Server data in a store** goes stale and needs manual invalidation.
   Store ids only.
3. **A query key missing a variable** that `queryFn` uses returns the wrong
   cached data. `@tanstack/eslint-plugin-query` (`exhaustive-deps`) catches
   it.
4. **Inline query keys** (`['devices', id]` in a component) miss
   invalidations. Always use the key factories.
5. **UI side effects inside mutation hooks** make them impossible to reuse.
   Close dialogs and navigate at the call site.
6. **`data ?? []` inline** is a new array every render and breaks
   memoization. Use module-level empty constants.
7. **Hooks inside `queryOptions` factories** are not allowed: factories are
   plain functions. `useTranslation` and `useQueryClient` belong in mutation
   hooks.
8. **A persisted shape changed without bumping `version`** crashes old
   installs.
9. **Facade hooks called conditionally** aren't caught by the lint (member
   call on a lowercase object). Call them at the top level.
10. **One QueryClient shared across tests** leaks cache between tests.
    Create one per test.
11. **`../` or cross-module imports** are lint errors by design. Promote the
    code to a shared layer instead.
12. **`Platform.OS` checks scattered around:** use `@utils/platform` or
    platform files.
