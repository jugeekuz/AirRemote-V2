---
name: frontend-dev
description: Use when running, debugging or checking the AirRemote app in frontend/ by hand (web, Android emulator, phone, iOS), when it can't reach the API, shows CORS errors, ignores an env change or fails to build, or before calling a frontend change done.
---

# Running and checking the app

Commands and setup are in `frontend/README.md`; this is the order to use
them in and how an agent checks a change.

## Start the backend

- [ ] Root `.env` exists (`cp .env.example .env`); for web it must contain
      `CORS_ORIGINS=http://localhost:8081` (`.env.example` has it). Restart
      `pnpm dev` after changing it.
- [ ] `pnpm dev` at the repository root (Docker for Postgres): the API on
      http://localhost:3000; `curl localhost:3000/health`.
- [ ] An account: Sign up in the app, or register one with curl:

  ```bash
  curl localhost:3000/users/register -H 'content-type: application/json' \
    -d '{"email":"you@example.com","firstName":"A","lastName":"B","password":"password123"}'
  ```

- [ ] Devices, remotes and buttons need a device: the mock device
      (`pnpm device-sim --mac AA:BB:CC:DD:EE:01`, then `/enroll`; see
      `tools/device-sim/README.md` for certificates). Add it in the app
      with Devices → ⊕ → "Enter manually" and the code it prints. The
      whole setup is "The whole app on your machine" in
      `frontend/README.md`.
- [ ] Never use the owner's running `pnpm dev`, root `.env` or database
      for a check that changes data: start a second API on other ports
      (`PORT=3001`, `DEVICE_PORT=8444`, the `certs/` paths,
      `CORS_ORIGINS=http://localhost:8081`, a throwaway Postgres), point
      the app at it with `EXPO_PUBLIC_API_URL=http://localhost:3001` in
      `frontend/.env.development.local`, and start the mock with
      `--server https://localhost:8444`. Remove all of it afterwards.

## Run the app

All from the root with `pnpm --filter @airremote/frontend <script>`, or
`pnpm <script>` inside `frontend/`:

| Script     | Use                                                                   |
| ---------- | --------------------------------------------------------------------- |
| `web`      | dev server + web app on http://localhost:8081                         |
| `android`  | builds and installs the development build, then starts (SDK, JDK 17)  |
| `ios`      | the same on a Mac with Xcode; on Linux iOS needs EAS (no project yet) |
| `start`    | dev server only, for an installed development build                   |
| `prebuild` | regenerates `android/` and `ios/` (git-ignored)                       |

These are development builds, not Expo Go. Rebuild (`prebuild`, then
`android`/`ios`) only when native code or native dependencies change.

## Environment

- `EXPO_PUBLIC_APP_ENV` and `EXPO_PUBLIC_API_URL`, validated in
  `src/config/env`; the committed `frontend/.env.development` points at
  `http://localhost:3000`.
- Overrides go in `frontend/.env.development.local` (git-ignored). Expo 58
  lets the committed `.env.development` beat shell variables, so
  `EXPO_PUBLIC_API_URL=... pnpm web` does nothing. Restart the dev server
  after an env change.
- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`. A phone on
  the same Wi-Fi: the computer's LAN address. Native requests need no CORS.

## Check a change in the browser (agents)

Tests passing is not "done" for UI. With the backend up:

- [ ] Start the web app in the background:
      `pnpm --filter @airremote/frontend web` (Bash `run_in_background`);
      wait until http://localhost:8081 answers. Add `--clear` after
      changing `src/ui/theme.css` or an env file.
- [ ] Load the Playwright MCP tools (`mcp__playwright__browser_*`; if they are
      deferred, fetch them with ToolSearch in one call): `browser_navigate`
      to http://localhost:8081, `browser_snapshot` to read the page,
      `browser_fill_form`/`browser_type` and `browser_click` to sign in and
      walk the changed flow.
- [ ] Check `browser_console_messages` (no errors or warnings from your
      change) and `browser_network_requests` (the calls you expect, no 4xx
      you didn't mean, no CORS failures).
- [ ] Check the loading, empty and error states (stop the API to see the
      Error dialog's network error and the list's "Try again") at a phone
      width (`browser_resize` to 390×844). The app is light-only, so dark
      mode needs no check.
- [ ] **Never grant the browser camera or microphone access.** Before
      opening the Add device wizard, stub them in the page (an init script
      that makes `navigator.mediaDevices.getUserMedia` reject and
      `enumerateDevices` resolve `[]`) and use "Enter manually".
- [ ] Tiles in edit mode wobble forever, so Playwright never sees them as
      stable: click a delete badge with
      `browser_evaluate` (`el => el.click()`).
- [ ] `browser_take_screenshot` of the result for your report; stop the dev
      server when done.

## Native checks

If you have no Android SDK (with an emulator or phone) and no Mac, you
can't run native builds. Anything that only shows on a device (the refresh
cookie surviving a restart, offline at launch, a native library) then needs
the manual checklist in `frontend/README.md` ("Manual checks on a device"):
say in your report that it was not run, and add the steps your change needs
to that list.

## Common failures

See "Common failures" in `frontend/README.md`. The usual ones:

- "Couldn't connect" at launch: the API isn't running, or the device can't
  reach `EXPO_PUBLIC_API_URL` (`localhost` on a phone is the phone).
- Web CORS errors or signed out on reload: `CORS_ORIGINS` lacks
  `http://localhost:8081`, or `pnpm dev` wasn't restarted.
- `Invalid environment: ...` at startup: a bad value in an env file.
- Android build fails on Java/Gradle: use JDK 17 (`JAVA_HOME`).
- ESLint misses a new module's rules in the editor: restart its ESLint
  server; `pnpm lint` always reads the current modules.
- "Using src/app as the root directory for Expo Router": harmless.
- Learning a button is refused with `DEVICE_OFFLINE` (409): the device isn't
  connected; start or re-enroll the mock device.
- Learning ends `failed` with `IR_READ_TIMEOUT`: nobody typed `/press` in the
  mock device within its 15 s read, so it answered `READ_TIMEOUT` itself.
- A command ends `expired` with `DEVICE_NOT_RESPONDING` (after about 20 s):
  the device disconnected or never answered at all.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

plus the browser check above for anything the user sees.
