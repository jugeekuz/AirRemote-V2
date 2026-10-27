---
name: frontend-feature
description: Use when adding a screen, flow or feature to the AirRemote app in frontend/ (a new module under src/modules/, a new route, a new user-facing capability), or when porting a V1 page from legacy/frontend (Login, SignUp, Devices, Remotes, RemoteButtons, Dashboard, Automations) to the V2 app.
---

# A frontend feature, end to end

A feature is a module (`src/modules/<m>/`) plus the global `api/` and
`queries/` folders of the backend domains it reads. Build it bottom-up; each
step below names the skill with the details. The rules themselves are in
[ARCHITECTURE.md][arch]; this is the order to apply them in.

## 1. Check the contract first

Nothing is built against an endpoint that isn't in `@airremote/contracts`.
Look in `packages/contracts/src/<domain>/<domain>.contract.ts` and in
`openapi.json` at the repository root (`grep -n '"/remotes' openapi.json`).
The V2 API when this skill was written (trust `openapi.json` over this list):

| Call                                  | Body schema                 | Response schema                     |
| ------------------------------------- | --------------------------- | ----------------------------------- |
| `POST /users/register`                | `registerUserRequestSchema` | `userResponseSchema` (201)          |
| `GET /health`                         |                             | `healthResponseSchema`              |
| `POST /auth/login`, `/refresh`        | `loginRequestSchema` / none | `accessTokenResponseSchema`         |
| `POST /auth/logout`                   |                             | none (`noContentSchema`)            |
| `GET /devices`                        |                             | `deviceListResponseSchema`          |
| `POST /devices` (enroll)              | `enrollDeviceRequestSchema` | `deviceResponseSchema` (201)        |
| `GET /remotes` (all, with `deviceId`) |                             | `remoteListResponseSchema`          |
| `POST /devices/{deviceId}/remotes`    | `createRemoteRequestSchema` | `remoteResponseSchema` (201)        |
| `GET /remotes/{remoteId}/buttons`     |                             | `buttonListResponseSchema`          |
| `POST /remotes/{remoteId}/buttons`    | `learnButtonRequestSchema`  | `deviceCommandResponseSchema` (202) |
| `POST /buttons/{buttonId}/press`      |                             | `deviceCommandResponseSchema` (202) |
| `GET /device-commands/{id}`           |                             | `deviceCommandResponseSchema`       |

`openapi.json` lists the devices routes as `/devices/` (a prefixed `/`
route); the API serves them at `/devices`, which the app calls. The only
get-by-id is `GET /device-commands/{id}`: there is none, and no rename,
delete or reorder, for devices, remotes or buttons, no device online status, no automations and no OAuth. Learning and
pressing return a device command that the app polls (see `frontend-api`).

## 2. Porting a V1 page

- Read `legacy/frontend/src/pages/<Page>.jsx` (`Login`, `SignUp`, `Devices`,
  `Remotes`, `RemoteButtons`, ...) and the components it uses for
  **behaviour only**: what it shows, which actions it offers, its loading,
  empty and error states, its texts. `legacy/` is read-only: never import,
  copy or imitate its code, structure or dependencies (root `CLAUDE.md`).
- Map every V1 action to a row of the table above. V1's own mechanisms are
  replaced, not ported: `useFetch`/`useFetchMemo` → queries, `AuthContext` →
  `authStore`/`useAuth`, the browser WebSocket for IR → polling a device
  command, `EditModeContext` → local state or a module store.
- **Until the backend catches up, a V1 feature with no V2 endpoint is shown
  but visibly not working:** render its control disabled (`isDisabled`) with
  a "not available yet" text from i18n (add one shared key the first time,
  then reuse it). No fake data, no stubbed API call, no local-only imitation
  (no reordering kept in a store, no client-side delete). List each such
  feature in your report.
- V1's look is a reference for layout and content; rebuild it with `@ui` and
  the theme tokens (`frontend-ui`).

## 3. Build it

- [ ] **Domain** for each backend domain not yet in `src/api/`:
      `pnpm --filter @airremote/frontend create-new domain <domain>`, named
      like the resource (`devices`, `remotes`, `buttons`, `device-commands`),
      then replace its placeholders → `frontend-api`.
- [ ] **Module:** `pnpm --filter @airremote/frontend create-new module <m>`.
      Do every "Add by hand:" line it prints (the `resources.ts` import, the
      param list in `src/types/navigation.types.ts` and its export from
      `src/types/index.ts`, the root registration). Restart the editor's
      ESLint server so the new module's import rules apply.
- [ ] **Module state**, only if several screens of the module share client
      state (a filter, a selection); a selection two modules share is a
      global store in `src/stores/` → `frontend-state`.
- [ ] **Helpers** for every decision (what to show, what's allowed) →
      `frontend-logic`.
- [ ] **Hooks** that compose queries and stores → `frontend-state`.
- [ ] **Components → screens → navigator** → `frontend-ui`. More screens:
      `create-new screen <name> --module <m>`, plus its "Add by hand:" lines.
- [ ] **Param list:** every route in its stack's type in
      `src/types/navigation.types.ts`. The id a screen is about is a route
      param (`RemoteButtons: { remoteId: string }`); a selection several
      screens share may be a store → [State ownership][state].
- [ ] **Root registration:** a signed-in module goes in the `isLoggedIn`
      branch of `src/navigation/root-navigator.tsx`, next to `Main` (wrap the
      branch in a `<Stack.Group>` once it has several screens); its URL goes
      in `src/navigation/linking.ts`.
- [ ] **i18n:** every text in the module's namespace → `frontend-i18n`.
- [ ] **Tests** for each layer you touched → `frontend-testing`.
- [ ] **Check it running** in the browser → `frontend-dev`.

## Rules that matter here

- Dependencies flow down; no `../`; modules never import other modules →
  [Layers and import rules][layers].
- Server data lives only in the query cache; stores hold ids →
  [State ownership][state].
- `api/` and `queries/` are global, by backend domain, not per module →
  [Directory structure][dirs].
- Screens are thin: hooks and components do the work → [Layers][layers].
- File, folder and export names → [Naming][naming].

## Example: porting V1's Remotes page

```
api/remotes/remotes.api.ts             remotesApi.list(), .create(deviceId, body)
queries/remotes/remotes.queries.ts     remotesKeys, remotesQueries.list()
queries/remotes/remotes.mutations.ts   useCreateRemoteMutation → invalidates remotesKeys.lists()
modules/remotes/helpers/remotes/       getRemotesOfDevice(remotes, deviceId) for `select`
modules/remotes/hooks/use-device-remotes/   useDeviceRemotes(deviceId): query + select, empty constant
modules/remotes/components/remote-tile/     one remote; rename/delete/reorder disabled
modules/remotes/screens/remotes-screen/     deviceId from its route params; list, empty state, "Add remote" dialog
modules/remotes/navigation/remotes-navigator.tsx
modules/remotes/i18n/locales/en/remotes.json
```

V1's drag-to-reorder and delete have no V2 endpoint, so they appear disabled
with the "not available yet" text.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

Then open the feature in the browser against `pnpm dev` (`frontend-dev`).

[arch]: ../../../frontend/ARCHITECTURE.md
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[state]: ../../../frontend/ARCHITECTURE.md#state-ownership
[dirs]: ../../../frontend/ARCHITECTURE.md#directory-structure
[naming]: ../../../frontend/ARCHITECTURE.md#naming
