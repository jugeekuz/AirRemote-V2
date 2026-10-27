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
- [ ] An account: the app has no sign-up screen yet, so register one:

  ```bash
  curl localhost:3000/users/register -H 'content-type: application/json' \
    -d '{"email":"you@example.com","firstName":"A","lastName":"B","password":"password123"}'
  ```

- [ ] Learning or pressing a button needs a connected device: the mock device
      (`pnpm device-sim`, see `tools/device-sim/README.md` for certificates
      and enrolling).

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
      wait until http://localhost:8081 answers.
- [ ] Load the Playwright MCP tools (`mcp__playwright__browser_*`; if they are
      deferred, fetch them with ToolSearch in one call): `browser_navigate`
      to http://localhost:8081, `browser_snapshot` to read the page,
      `browser_fill_form`/`browser_type` and `browser_click` to sign in and
      walk the changed flow.
- [ ] Check `browser_console_messages` (no errors or warnings from your
      change) and `browser_network_requests` (the calls you expect, no 4xx
      you didn't mean, no CORS failures).
- [ ] Check the loading, empty and error states (stop the API to see the
      network error toast), a phone width (`browser_resize` to 390×844) and
      dark mode (`browser_emulate_media` with `colorScheme: 'dark'`).
- [ ] `browser_take_screenshot` of the result for your report; stop the dev
      server when done.

## Native checks

The agent that built the app had no Android SDK and no Mac. Anything that
only shows on a device (the refresh cookie surviving a restart, offline at
launch, a native library) needs the manual checklist in `frontend/README.md`
("Manual checks on a device"); say in your report that it was not run, or
add the steps your change needs to that list.

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
- Learning answers `DEVICE_OFFLINE` (409): the device isn't connected (start
  or re-enroll the mock device). It stays `pending` until it expires (about
  20 s): the mock device is waiting for `/press`.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

plus the browser check above for anything the user sees.
