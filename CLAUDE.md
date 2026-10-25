# AirRemote V2

AirRemote V2 is being rewritten from scratch, one component at a time:
`backend/` first, then `firmware/`, then `frontend/`.

## `legacy/` is read-only reference

`legacy/` holds the original V1 code (also tagged `v1-final`). It is there
only so you can look up how V1 did something.

- Never edit anything under `legacy/`.
- Never import, link, symlink or build from `legacy/`; new code must stand on
  its own.
- Don't copy its patterns, structure or dependencies by default. V2 changes the
  infrastructure, structure and language on purpose; take behaviour and domain
  knowledge from V1, not its implementation.
- Keep `legacy/` out of new tooling: workspaces, tsconfig/linter globs, CI
  paths and Docker build contexts.

When a V2 component replaces its V1 counterpart, its `legacy/<component>`
folder is deleted in its own commit.
