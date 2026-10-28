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
| `DELETE /devices/{deviceId}`          |                             | none (`noContentSchema`, 204)       |
| `DELETE /remotes/{remoteId}`          |                             | none (`noContentSchema`, 204)       |
| `DELETE /buttons/{buttonId}`          |                             | none (`noContentSchema`, 204)       |

`openapi.json` lists the devices routes as `/devices/` (a prefixed `/`
route); the API serves them at `/devices`, which the app calls. Devices,
remotes and buttons have no get-by-id, rename or reorder; the only get-by-id
is `GET /device-commands/{id}`. A delete answers 204 and takes the children
with it (a device's remotes, buttons and commands; a remote's buttons), and
someone else's id answers `404 NOT_FOUND`, like a missing one. Deleting a
device also closes its connection; it can then pair again. A device
response carries `online` (whether it is connected right now, from the
server's in-process registry), which is why the device list polls. There
are no automations and no OAuth. Learning and pressing return a
device command that the app polls (see `frontend-api`).

## 2. Porting a V1 page

- Read `legacy/frontend/src/pages/<Page>.jsx` (`Login`, `SignUp`, `Devices`,
  `Remotes`, `RemoteButtons`, ...) and the components it uses for
  **behaviour only**: what it shows, which actions it offers, its loading,
  empty and error states, its texts. `legacy/` is read-only: never import,
  copy or imitate its code, structure or dependencies (root `CLAUDE.md`).
- Map every V1 action to a row of the table above. V1's own mechanisms are
  replaced, not ported: `useFetch`/`useFetchMemo` → queries, `AuthContext` →
  `authStore`/`useAuth`, the browser WebSocket for IR → polling a device
  command (`useDeviceCommand`), `EditModeContext` → `EditModeProvider` and
  `useEditMode` from `@contexts/edit-mode`, `alert()` and V1's error modal
  → the Error dialog (`alert` from `@ui`, opened for you by failed
  requests).
- **Until the backend catches up, a V1 feature with no V2 endpoint is shown
  but visibly not working:** render its control disabled (`isDisabled`) with
  a "not available yet" text from i18n (`messages:not-available`, as
  "Continue with Google" does; the inert Dashboard and Automations tabs and
  the disabled "Invite a friend" are the other examples). No fake data, no
  stubbed API call, no local-only imitation (no reordering kept in a
  store). List each such feature in your report.
- V1's look is resolved to values (every class, colour, size, text and
  asset of its pages) in
  `docs/superpowers/specs/2026-10-28-v1-look-inventory.md`; read that
  before the legacy code. Rebuild it with `@ui`, the shared components and
  the theme (`frontend-ui`).
- A deliberate difference from V1 (a Back button, a not-found state, a
  disabled Next) is fine when V2 needs it; list it in your report and in
  `frontend/ARCHITECTURE.md` ("Deliberate differences from V1").

## 3. Build it

- [ ] **Domain** for each backend domain not yet in `src/api/`:
      `pnpm --filter @airremote/frontend create-new domain <domain>`, named
      like the resource (`devices`, `remotes`, `buttons`, `device-commands`),
      then replace its placeholders → `frontend-api`.
- [ ] **Module:** `pnpm --filter @airremote/frontend create-new module <m>`.
      Do every "Add by hand:" line it prints (the `resources.ts` import, the
      param list in `src/types/navigation.types.ts` and its export from
      `src/types/index.ts`, the root registration). Its first screen is
      `<m>-list-screen/`, route `<M>List`, inside the root route `<M>`
      (`module devices`: `DevicesList` inside `Devices`); never give a nested
      route its parent's name. Restart the editor's ESLint server so the new
      module's import rules apply.
- [ ] **Module state**, only if several screens of the module share client
      state (a filter, a selection); a selection two modules share is a
      global store in `src/stores/` → `frontend-state`.
- [ ] **Helpers** for every decision (what to show, what's allowed) →
      `frontend-logic`.
- [ ] **Hooks** that compose queries and stores → `frontend-state`.
- [ ] **Components → screens → navigator** → `frontend-ui`. A signed-in
      screen is `Screen` > `ScrollView px-2` > `TopToolbar`, then V1's
      `SectionHeader`, `NoticeBox` and `TileGrid` / `EmptyTiles`, as
      `modules/devices/screens/device-list-screen/` does. More screens:
      `create-new screen <name> --module <m>`, plus its "Add by hand:" lines.
- [ ] **Param list:** every route in its stack's type in
      `src/types/navigation.types.ts`. The id a screen is about is a route
      param (`RemoteDetails: { remoteId: string }`); a selection several
      screens share may be a store → [State ownership][state].
- [ ] **Registration:** a signed-in module is a tab: its navigator goes in
      `src/navigation/main-tabs.tsx` (and in `MainTabParamList`), and its
      item in `@components/bottom-tab-bar`. Dashboard and Automations are
      already there, inert: building one replaces its `NotAvailable`
      component and drops its `isInert`. Its URLs go in
      `src/navigation/linking.ts` → [Navigation][nav].
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

## Example: V1's Remotes page as it was ported

```
api/remotes/remotes.api.ts             remotesApi.list(), .create(deviceId, body), .delete(id)
queries/remotes/remotes.queries.ts     remoteKeys, remoteQueries.list()
queries/remotes/remotes.mutations.ts   useCreateRemoteMutation, useDeleteRemoteMutation (onSettled)
modules/remotes/helpers/remotes/       getRemoteDevice(remote, devices), isValidRemoteName(name)
modules/remotes/hooks/use-remote-list/ useRemoteList(): remotes + their devices, subscribed while focused
modules/remotes/components/remote-tile/        one remote with its device's dot; delete badge in edit mode
modules/remotes/components/add-remote-dialog/  V1's wizard: type, device, name (flat files per step)
modules/remotes/screens/remote-list-screen/    route RemoteList; EditModeProvider around remote-list.tsx
modules/remotes/navigation/remotes-navigator.tsx   RemoteList → RemoteDetails { remoteId }
modules/remotes/i18n/locales/en/remotes.json
```

V1's drag-to-reorder and rename have no V2 endpoint and were left out
(V2 sorts by name); delete calls `DELETE /remotes/{remoteId}` after V1's
confirmation.

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
[nav]: ../../../frontend/ARCHITECTURE.md#navigation
