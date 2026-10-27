---
name: frontend-logic
description: Use when writing a business rule, a derived value, a formatter or a decision (what to show, what is allowed) in frontend/, working in src/helpers or src/modules/*/helpers, or adding a *.constants.ts file, an enum-like constant or a named number or string.
---

# Helpers and constants

Decisions are pure functions in helpers, tested on their own; named values
are constants. Components, hooks and queries call them.

## Steps

- [ ] `pnpm --filter @airremote/frontend create-new helper <name> [--module <m>]`
      creates `helpers/<name>/` with `<name>.helpers.ts`, `<name>.constants.ts`,
      a test and `index.ts` (with a placeholder `format<Name>` to replace).
- [ ] Shared by several modules → `src/helpers/<domain>/`; one module only →
      `src/modules/<m>/helpers/<topic>/`.
- [ ] Write the test first: inputs → outputs, the happy path, an edge case.

## Helper rules

- Pure and deterministic: no API calls, no stores, no queries, no UI, no
  dates or randomness from inside (take `now` as a parameter) →
  [Layers and import rules][layers].
- Helpers may import constants, utils, config, `@app-types`, the contracts
  and i18n constants; never stores, queries, api, adapters, `@ui` or
  presentation (ESLint) → [Layers and import rules][layers].
- Named functions for standalone logic (`isSignedOutError`,
  `getRemotesOfDevice`); a grouped plain `const` object (`remoteHelpers`)
  only when three or more functions answer related questions about the same
  thing with the same input. Don't mix questions and commands in one object.
- Names say what comes back: `getX` a value, `isX`/`hasX`/`canX` a boolean,
  `formatX` a display string → [Naming][naming].
- Take contract types (`RemoteResponse`, `DeviceCommandResponse`) and
  enums (`REMOTE_TYPES`, `DEVICE_COMMAND_STATUSES`) from
  `@airremote/contracts`; never redeclare them.
- One-way dependencies between helpers; when one helper folder imports
  another, say so in a header comment:

  ```ts
  /**
   * DEPENDENCY RULE: This module depends on @helpers/device-commands.
   * Device-command helpers must NEVER import from this module.
   */
  ```

- Generic, domain-free code (strings, numbers, dates) is a util in
  `src/utils/<topic>/<topic>.utils.ts`, not a helper → [Layers][layers].

## Constant rules

- An enum-like set is a frozen `as const` object with a singular
  UPPER_SNAKE name and its type derived from it; never a TypeScript `enum`:

  ```ts
  export const AUTH_STATUS = Object.freeze({
    HYDRATING: 'hydrating',
    AUTHENTICATED: 'authenticated',
  } as const);
  export type AuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
  ```

  (`src/stores/auth/auth.constants.ts`, `STORE_PERSIST_KEY` in
  `src/stores/stores.constants.ts`) → [Naming][naming].

- Single values are UPPER_SNAKE with their unit in the name:
  `REQUEST_TIMEOUT_MS` (`src/api/api.constants.ts`), `DEFAULT_DEBOUNCE_MS`.
- No magic numbers or strings in code: name them.
- Location: next to the code that uses them (`<name>.constants.ts`, which
  belongs to its folder's layer), a helper's in
  `helpers/<domain>/<domain>.constants.ts`, module-wide ones in
  `modules/<m>/constants/` (which imports nothing but types and contracts),
  API ones in `src/api/api.constants.ts` → [Layers and import rules][layers].
- Empty defaults for query data are module-level constants in the hook or
  component that uses them (`const EMPTY_REMOTES: RemoteResponse[] = []`) →
  [Queries][queries].

## Example: device-command helpers

```ts
// src/helpers/device-commands/device-commands.helpers.ts
import type { DeviceCommandResponse } from '@airremote/contracts';

/** Whether the device has answered (or the command ran out of time). */
export function isDeviceCommandSettled(
  command: DeviceCommandResponse,
): boolean {
  return command.status !== 'pending';
}

/** The code to show for a command that did not succeed, if any. */
export function getDeviceCommandErrorCode(command: DeviceCommandResponse) {
  return command.status === 'succeeded' ? undefined : command.error?.code;
}
```

Existing references: `src/helpers/errors/` (a function and its constants
list, with a test that pins the list), `src/helpers/auth/auth.helpers.ts`,
`src/helpers/i18n/i18n.helpers.ts` (a type guard for stored values).

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[naming]: ../../../frontend/ARCHITECTURE.md#naming
[queries]: ../../../frontend/ARCHITECTURE.md#queries
