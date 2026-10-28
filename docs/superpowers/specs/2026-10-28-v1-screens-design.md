# V1 screens on the V2 frontend — design

Date: 2026-10-28 · Branch: `rewrite/frontend-screens`

## Intent

The owner asked (2026-10-27, before going to sleep) for the first real screens of
the V2 app, built without stopping for approval and reviewed the next day:

- Register / Login
- Devices
- Remotes
- Remote details (the remote's buttons)

They must look as close to V1 as possible (typography, spacing, look) while
following the frontend's architecture (`frontend/ARCHITECTURE.md`, the
`frontend-*` skills). Some things work differently in V2: a device is enrolled
with a pairing code shown as a QR code, buttons are learned and pressed through
device commands. Everything must work against the V2 backend as it is; where
the backend lacks an endpoint the screens need, this change adds it.

The V1 reference is `docs/superpowers/specs/2026-10-28-v1-look-inventory.md`
(committed with this design): every class, colour, size, copy, asset and
behaviour of V1's pages, resolved to values, and a V1-vs-V2 feature table.

## Goals

- Login and Sign up look like V1 and work with `POST /auth/login` and
  `POST /users/register`.
- Devices, Remotes and Remote details look like V1 (top bar, section header
  with count badge and add/edit pill, notice box, tile grid, tiles, dark info
  card, button tiles, edit mode with wobble and delete badges, V1's modal
  wizards) and work end to end with a real or simulated device: enroll, see it
  online, add a remote, learn a button, press it, delete things.
- The backend gains what the screens need and has nothing for yet: the
  device's online status, and deleting devices, remotes and buttons.
- Features V1 had that V2 does not build yet are visible but do not work
  (the owner's rule): Dashboard and Automations tabs, "Continue with Google",
  "Invite a friend".

## Non-goals

- No Dashboard, Automations, costs or click counts.
- No reordering (drag and drop) and no rename. V1 saved a custom order; V2
  sorts by name. Edit mode keeps the wobble and the delete badges, not the
  drag handles.
- No `GET /users/me` (V1's header never showed the user's name; only the
  Dashboard did).
- No tablet/desktop sidebar. Phones first; wider screens get more grid
  columns, as V1's grid did.
- No dark mode: V1 is light-only, so the app is light-only.

## Decided by the owner

- The four pages, V1's look, V2's architecture, the V2 backend as it is plus
  any missing endpoint the pages need.
- Enrollment by QR code / pairing code.
- Unbuilt features show but don't work.
- No approvals needed; calls are listed for review afterwards.

## Calls made for the owner (to review)

1. **Sizes 1:1 with V1's CSS pixels**, ignoring V1's `initial-scale=0.9`
   viewport (things are ~11 % bigger than V1 on a phone, and more legible).
2. **Fonts:** the system font everywhere V1 used Tailwind's default stack;
   Poppins (via `expo-font`) where V1 named it (empty states, loading text).
   Roboto only appears in V1's sidebar and Dashboard, which aren't built.
3. **Colours:** Tailwind's default palette classes with V1's values (gray,
   green, blue…); the kit's accent becomes black, as V1's NextUI `primary`
   was. Light-only.
4. **Icons** from `lucide-react-native` (V1 used `lucide-react`, same names).
   **Images** (logo, device and appliance pictures, status dots, avatar) are
   copied from `legacy/frontend/src/assets` into `frontend/src/assets` —
   files, not code; nothing imports from `legacy/`.
5. **Errors look like V1's:** a top "Error" dialog with an OK button, opened
   imperatively from `@ui` (like `toast`). `notifyApiError` shows it instead of
   a toast. Login and Sign up errors use it too (V1 used `alert()`).
6. **Navigation:** auth stack (Login, Sign up); signed in, a bottom tab bar
   styled like V1's (Dashboard, Remotes, Devices, Automations; Dashboard and
   Automations greyed and inert). The app opens on Remotes. Remotes is a stack
   (list → details by remote **id**, not name as V1 did). Each screen has V1's
   top bar: the short logo (or a back arrow on details) and the avatar menu
   ("Invite a friend" disabled, "Logout").
7. **Online status:** the device response gains `online` (from the API
   instance's in-process `DeviceConnections`; with several instances it is
   per-instance, which is the known limit of `DeviceConnections`). The device
   list refetches every 30 s and on focus. The notice box says so instead of
   V1's "up to 10 minutes".
8. **Deleting a device** deletes its remotes, buttons and commands (database
   cascades) and closes its WebSocket if connected; the board is then
   un-enrolled and can pair again. Deleting needs the V1 confirmation dialog.
9. **Add device** keeps V1's three-step modal: (1) how to get a code (real
   board: Wi-Fi then `pair` over the serial console; simulator: `/enroll`),
   (2) scan the QR code with the camera (`expo-camera`), or "Enter manually"
   (MAC address and the 8-character code, normalised with the contract's
   `normalisePairingCode`), (3) the device name, then Finish. The QR format is
   the simulator's: `airremote://pair?mac=<MAC>&code=<CODE>`. Opening that link
   on a phone (the app registers the `airremote` scheme) opens Devices with the
   modal at step 3, filled in.
10. **Sign up** asks for first name, last name, email, password and
    confirmation (V2 needs first/last name; V1 had one username), in V1's
    stacked bordered group, validated with the contract's schema plus the
    match check. Success goes to Login, like V1.
11. **Learn a button:** V1's "does your remote have a screen?" step is
    dropped (V2 stores no button state); its advice stays as help text in the
    instructions step. Steps: name → instructions → listening (indeterminate
    progress while the command is pending). Success closes the modal; failure
    shows the Error dialog with the code's message.
12. **Press a button:** V1's round control: green power icon → spinner while
    the command is pending → green tick with V1's pop → idle. Failure shows the
    Error dialog. The whole circle is the tap target (V1's was only the icon).
13. **Button tiles** drop V1's "State / Stateless" line (no such field in V2)
    and the always-visible grip.
14. **Polling** a device command uses the query's `refetchInterval` (500 ms)
    while `pending`.

## Backend changes

- `deviceResponseSchema` gains `online: boolean` (expansive). `GET /devices`
  and `POST /devices` fill it from `DeviceConnections`.
- `DELETE /devices/{deviceId}`, `DELETE /remotes/{remoteId}`,
  `DELETE /buttons/{buttonId}` → 204; `404 NOT_FOUND` if it isn't the user's.
  Deleting a device closes its socket if connected.
- Each with unit, integration and e2e tests in the repo's layers, OpenAPI
  regenerated.

## Frontend shape

Follows `frontend/ARCHITECTURE.md`. New backend domains under `src/api` and
`src/queries`: `users` (register), `devices` (list, enroll, delete),
`remotes` (list, create, delete), `buttons` (list, learn, press, delete),
`device-commands` (detail, polled). Modules: `auth` (Login, Sign up),
`devices`, `remotes` (list + details). Shared chrome in `src/components`
(top bar, tab bar, section header, add/edit pill, notice box, tile grid,
empty state, status dot, delete badge, confirmation). Edit-mode state is a
scoped store per screen (V1 reset it when leaving the page). Kit additions
(error dialog facade, any composite) in `src/ui`.

## Verification

- All tests (`pnpm test`), lint, typecheck.
- In a real browser against a second API and the device simulator (never the
  owner's running `pnpm dev`, `.env` or database): sign up, log in, enroll the
  simulator by manual entry, see it online, add a remote, learn a button
  (`/press` in the simulator), press it, delete button, remote, device; error
  dialogs for wrong password, taken email, device offline, learn timeout.
  Screenshots at phone width.
- Native boot remains the owner's manual checklist (no Android SDK here).
