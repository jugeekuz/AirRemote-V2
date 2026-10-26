# IR remotes and buttons: data model — design

Date: 2026-10-26 · Branch: a new branch off `main`

## Intent

An AirRemote device drives one or more IR remotes; each remote has buttons;
each button holds the IR signal the device replays. This change defines how
remotes and buttons are stored. Nothing reads or writes them yet: endpoints,
contracts and device messages come with the features that need them.

V1 stored a button's signal as the string representation of an array
(`"[9000,4500,560,…]"`). V2 stores it as real numbers the database can check.

## Goals

- A remote has a name and a type chosen from a fixed list.
- A button has a name and its raw IR timings.
- Names are unique within their parent.
- The database itself rejects malformed data.

## Non-goals

- No endpoints, services, repositories, contracts or device messages.
- No carrier frequency: 38 kHz stays hard-coded in the firmware, as in V1.
- No decoded protocol (NEC, Samsung, …) next to the raw timings.
- No ordering (`position`) and no timestamps; they come with the UI that
  needs them.
- No firmware changes.
- No state for learning a button (asking the device to read a code and
  waiting for its answer). That belongs to the feature that sends the "read
  a code" message; see "Learning a button" below.

## Anti-goals

- A button signal stored as text, JSON or an opaque blob.
- Constraints only in application code, so a bad row can still be written.

## Decided by the owner

- **A remote has a name and a type** from V1's list of categories.
- **A button has a name and its raw pulse timings**, not stored as a string.
- **38 kHz is hard-coded**; no carrier column.
- **Names are unique within their parent.**
- **Scope: the data model only.**
- **Up to 2048 timings per button**, for long air-conditioner codes.
- **`timings_us` is required.** A button exists only once its code has been
  read; a half-made button is not stored in `buttons`.

## The model

### `remotes` (existing: `id`, `device_id → devices`, `name`)

- **New column `type`**: Postgres enum `remote_type`, required, no default.
  Values, from V1's categories:

  | Value             | V1 name          |
  | ----------------- | ---------------- |
  | `air_conditioner` | Air Conditioner  |
  | `audio_system`    | Audio System     |
  | `dehumidifier`    | Dehumidifier     |
  | `heater`          | Heater           |
  | `rgb_lights`      | RGB Lights       |
  | `smart_tv`        | Smart TV         |
  | `generic_device`  | Generic Device   |

- **Unique name within its device**, ignoring case: a unique index on
  `(device_id, lower(name))`. It replaces the existing
  `remotes_device_id_idx`, which it makes redundant.
- **Name rules in the database** (a new check on the existing `name`): 1–100
  characters, no leading or trailing whitespace, so `Living room` and
  `Living room ` cannot both exist. Any characters are allowed (V1's
  `^[a-zA-Z0-9- ]+$` would refuse `Σαλόνι`).

### `buttons` (new)

| Column       | Type        | Rules                                              |
| ------------ | ----------- | -------------------------------------------------- |
| `id`         | `uuid`      | primary key, random default                        |
| `remote_id`  | `uuid`      | not null, `→ remotes.id`, deleted with its remote |
| `name`       | `text`      | not null; same name rules as remotes               |
| `timings_us` | `integer[]` | not null; checks below                             |

- **Unique name within its remote**, ignoring case: a unique index on
  `(remote_id, lower(name))`. It also serves lookups by remote, so no
  separate index on `remote_id`.
- **`timings_us`** holds the raw signal exactly as the firmware captures and
  replays it (IRremoteESP8266's `uint16_t` buffer): durations in
  microseconds, alternating carrier on (mark) and off (space), starting with
  a mark. Check constraints:
  - one-dimensional, 1 to 2048 entries. V1 captured up to 1024, which
    IRremoteESP8266 suggests for air conditioners (about 511 bits); 2048
    leaves room for remotes that repeat long frames, still fits a device
    message under the gateway's 16 KiB frame limit as JSON (about 12 KB at
    most), and means the V2 firmware's capture buffer should be at least
    2048 entries;
  - no `NULL` entries;
  - every entry between 0 and 65535 (a `uint16_t`). Zero is allowed: when a
    gap is longer than 65535 µs, IRremoteESP8266's `resultToRawArray()`
    splits it into `65535, 0, rest`, and `sendRaw` skips the `0`. V1's 15 ms
    receive timeout never produced one; a longer V2 timeout would.

  `integer`, not `smallint`: entries go up to 65535 and `smallint` stops at
  32767. A row stores only its actual length; a typical code is 0.5–2 KB.

### Learning a button

`timings_us` is required, so a button is created in one step, with its code,
once the device has reported what it read. A capture in progress (the device
listening, then answering, timing out or going offline) is tracked apart from
`buttons`, as V1 did with its request pool. Whether that is in memory or a
small table is decided by the feature that implements learning. Re-learning an
existing button replaces its `timings_us`.

### Existing data

`remotes` has no rows anywhere yet (nothing creates them), but the migration
must not fail if a dev database has some: it backfills `type` with
`generic_device` before making it required. A duplicate name within a device
would still fail the unique index; there are none to fail on.

## Implementation notes

- Drizzle schema: `remote_type` with `pgEnum`, `buttons` in its own file
  `packages/db/src/schema/buttons.ts`, re-exported from `index.ts`; the
  unique indexes on `lower(name)` and the checks with Drizzle's `check()`.
- Migration generated with `pnpm db:generate --name remotes_and_buttons`; the
  backfill is the one hand-written part (a data change, as `CLAUDE.md`
  allows).
- The list of remote types lives in `@airremote/contracts` (`REMOTE_TYPES`
  and `remoteTypeSchema`): the frontend will need it, and contracts must stay
  free of server code. `@airremote/db` imports it for `pgEnum`, so db gains
  a dependency on contracts, not the other way round.

## Testing

Integration tests against a real Postgres (the database enforces these rules,
so they can only be tested there):

- a remote and a button with valid data are stored and read back, timings
  intact;
- a remote type outside the list is rejected;
- a name that is empty, longer than 100 characters, or has leading or
  trailing whitespace is rejected, for remotes and for buttons;
- two remotes named `Living room` and `living room` on one device are
  rejected; the same name on two devices is accepted; likewise for buttons
  within a remote;
- `timings_us` rejects: no value (`NULL`), an empty array, 2049 entries, a
  `65536`, a negative, a `NULL` entry, a two-dimensional array; it accepts
  exactly 2048 entries and the values 0 and 65535;
- deleting a remote deletes its buttons; deleting a device deletes its
  remotes and their buttons;
- the migration applies to a database that already has a remote row, and
  that row ends up `generic_device`.

## Calls made in design, not by the owner

- Column name `timings_us`, `integer[]` rather than packed binary or JSON.
- Enum value spellings (snake_case); display names stay in the frontend.
- No default for `type`.
- Case-insensitive uniqueness.
- Name rules in the database (1–100 characters, trimmed), any characters.
- The remote type list in `@airremote/contracts`, imported by the db package.
- Dropping `remotes_device_id_idx` in favour of the unique index.
- Values 0–65535 (0 for the library's long-gap spacer); an
  even length is allowed (no "must end with a mark" rule), since the
  firmware replays any length.
- Backfilling existing remotes with `generic_device`.

## Left to the builder

- Where the integration tests live (alongside the backend's existing
  integration tests, or a new integration folder in `packages/db`), within
  the conventions in `CLAUDE.md`.
- Constraint and index names.
