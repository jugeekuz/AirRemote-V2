# Provision device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/provision-device.sh` gives the board on USB a key and a
`CN = MAC` certificate in its `identity` partition, then deletes the key from
the computer.

**Architecture:** One Bash script. The certificate comes from `dev-certs.sh`.
Every board and ESP-IDF step runs through `firmware/scripts/idf.sh exec`:
`esptool`, the NVS generator `python -m esp_idf_nvs_partition_gen` and the
NVS parser `nvs_tool.py`. E2E tests swap `idf.sh` for a fake board that
answers `esptool` from a local file and forwards everything else to the real
`idf.sh`.

**Tech Stack:** Bash, OpenSSL, ESP-IDF v6.0.3 (Docker), Vitest (e2e project).

**Spec:** `docs/superpowers/specs/2026-10-27-provision-device-design.md`

## Global Constraints

- **Never leave a private key on disk** after any run, failed or not:
  - delete `<ca-dir>/devices/<MAC-dashed>.key`;
  - delete the temporary folder under `firmware/build/`, which holds the PEM
    copy, `identity.bin` and the read-backs.
- **Never overwrite an existing identity without `--force`.** "Has an
  identity" means namespace `identity` holds `cert` or `key` when the region
  is parsed as NVS.
- **The certificate comes only from `scripts/dev-certs.sh --out <ca-dir> device <MAC>`.**
  Record files are named `<ca-dir>/devices/AA-BB-CC-DD-EE-FF.{crt,key}`.
- **The identity offset and size come from `firmware/partitions.csv`** and
  appear nowhere else.
- **No new host dependencies.** Use `bash`, `openssl`, `python3` (already
  used in the repo's tooling) and Docker through `idf.sh`.
- **Every path given to a container command is relative to `firmware/`**
  (the container's `/project`), e.g. `build/provision-XXXX/identity.bin`.
- **Tests never hand `/dev/ttyUSB0` to a container.** The fake forwards with
  `ESPPORT=/nonexistent`.
- **Every commit message ends with** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Done means** `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Review Focus

1. **Ctrl+C or a failure mid-run leaves no key**: the trap covers `INT`,
   `TERM` and `EXIT`. Task 2 tests a failure after the key exists; an
   interrupt runs the same trap.
2. **`--force` keeps the old `.crt` record when the run fails** before the
   read-back passes (Task 2 test).
3. **A board that ran other firmware** (random bytes in `identity`) is
   provisioned without `--force` (Task 1 test).
4. **A missing `ESPPORT` port** gives a plain message, not a Docker error
   (Task 2 test).
5. **The CA from `--ca-dir` is used, not `certs/`**: every test passes a temp
   CA dir, and the certificate must verify against it (Task 1).

---

### Task 1: Provision a blank board

**Files:**
- Create: `scripts/provision-device.sh` (executable),
  `backend/e2e/support/fake-board-idf.sh` (executable)
- Test: `backend/e2e/provision-device.e2e.ts`

**Interfaces:**
- Produces:
  - `scripts/provision-device.sh [--ca-dir DIR] [--force]`:
    - `DIR` defaults to `certs/` at the repo root;
    - `ESPPORT` defaults to `/dev/ttyUSB0`;
    - `PROVISION_IDF_SH` overrides the path to `idf.sh`;
    - exit 0 on success, 1 on any failure;
    - prints the MAC, the certificate path and its SHA-256 fingerprint, and
      "Next: enroll the device".
  - The fake board, `fake-board-idf.sh`, is driven by env:
    - `FAKE_FLASH`: path to a region-sized file, the board's `identity`;
    - `FAKE_MAC`: e.g. `aa:bb:cc:dd:ee:07`;
    - `FAKE_CORRUPT_READBACK=1`: the read after a write returns flipped
      bytes.

    It answers three commands:
    - `exec esptool read-mac` prints `MAC:                <FAKE_MAC>`;
    - `exec esptool read-flash <offset> <size> <path>` copies `FAKE_FLASH`
      to `firmware/<path>`;
    - `exec esptool write-flash <offset> <path>` copies `firmware/<path>`
      over `FAKE_FLASH`.

    For both flash commands it fails unless `<offset>` and `<size>` match
    the `identity` line of `firmware/partitions.csv`. Anything else runs
    `ESPPORT=/nonexistent firmware/scripts/idf.sh "$@"`.

- [ ] **Step 1: Write the fake board**, as in Interfaces.

- [ ] **Step 2: Write the failing e2e tests**

  Follow `dev-certs.e2e.ts`. Use a temp CA dir made with
  `dev-certs.sh --out <tmp>`, and a `FAKE_FLASH` under
  `firmware/build/fake-board-<random>/`, so the real parser can read it in
  the container. Remove both in `afterEach`. Give each test a 120 s timeout.
  A helper `parseIdentity(flashPath)` runs
  `firmware/scripts/idf.sh exec python $IDF_PATH/components/nvs_flash/nvs_partition_tool/nvs_tool.py -f json -d minimal <path>`
  (inside `bash -c`, with `ESPPORT=/nonexistent`) and returns the entries.

  - `provisions a blank board`. `FAKE_FLASH` is `0xFF × size`. Expect:
    - exit 0;
    - `parseIdentity` gives exactly the entries `identity/cert` and
      `identity/key`, both `string`;
    - the certificate verifies against the temp CA, with subject
      `CN = AA:BB:CC:DD:EE:07`;
    - the key's public key equals the certificate's
      (`openssl pkey -pubout` vs `openssl x509 -pubkey -noout`);
    - `<ca>/devices/AA-BB-CC-DD-EE-07.crt` exists and equals the stored
      `cert`;
    - `<ca>/devices/AA-BB-CC-DD-EE-07.key` does not exist;
    - no `firmware/build/provision-*` folder exists;
    - stdout contains the MAC and the certificate's fingerprint.
  - `provisions a board with leftovers from older firmware without --force`:
    `FAKE_FLASH` is random bytes; expect exit 0 and both entries present.

  Run: `pnpm test:e2e backend/e2e/provision-device.e2e.ts`
  Expected: FAIL (the script doesn't exist).

- [ ] **Step 3: Write `scripts/provision-device.sh`**

  In the style of `dev-certs.sh`: `usage`, `fail`, an argument loop,
  `set -euo pipefail`. Then:
  1. **Check:**
     - `openssl` exists;
     - `<ca-dir>/device-ca.{crt,key}`, or fail with
       "no CA in DIR; run scripts/dev-certs.sh first";
     - `ESPPORT` exists, unless `PROVISION_IDF_SH` is set (the fake has no
       port).
  2. **Read the identity location:** the `identity` row of
     `firmware/partitions.csv`, trimmed. Fail if there is none.
  3. **Create the temporary folder:** `firmware/build/provision-XXXXXX`
     (`mktemp -d`). Install `trap cleanup EXIT INT TERM`; `cleanup` removes
     the folder and `<ca>/devices/<MAC-dashed>.key`, and restores or removes
     the `.crt` unless the run succeeded.
  4. **Read the MAC:** `read-mac`. Parse `MAC:\s+xx:…` and upper-case it.
  5. **Check for an existing identity:** `read-flash` into
     `before.bin`. A `python -c` inside the same container call loads
     `nvs_tool.py -f json -d minimal`'s output and decides whether an
     `identity` entry named `cert` or `key` exists. If so, and without
     `--force`, fail (message in Task 2).
  6. **Issue the certificate:**
     `dev-certs.sh --out <ca-dir> device <MAC> >/dev/null`. Then copy the
     `.crt` and `.key` into the temporary folder and write `identity.csv`:

     ```
     key,type,encoding,value
     identity,namespace,,
     cert,file,string,/project/build/<tmp>/cert.pem
     key,file,string,/project/build/<tmp>/key.pem
     ```

     Generate the image:
     `python -m esp_idf_nvs_partition_gen generate build/<tmp>/identity.csv build/<tmp>/identity.bin <size>`.
  7. **Write and check:** `write-flash` the image, then `read-flash` into
     `after.bin`, then `cmp` it with `identity.bin`. A mismatch fails with
     "the board's identity could not be confirmed; run again with --force".
  8. **Finish:** mark the run as succeeded, then print the summary.
     `cleanup` still deletes the key and the folder.

  Run: the Step 2 command. Expected: PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/provision-device.sh backend/e2e
  git commit -m "Add a script that provisions a board's identity"
  ```

### Task 2: Refusing, `--force` and failures

**Files:**
- Modify: `scripts/provision-device.sh`
- Test: `backend/e2e/provision-device.e2e.ts`

**Interfaces:**
- Consumes: the script and the fake from Task 1.

- [ ] **Step 1: Write the failing tests**

  - `refuses a board that already has an identity`:
    - provision once, then save the `.crt` and `FAKE_FLASH`, and run again;
    - expect exit 1, with stderr containing
      `the board already has an identity` and the old certificate's
      fingerprint;
    - `FAKE_FLASH` and the `.crt` are unchanged, and no key or temporary
      folder is left.
  - `replaces it with --force`: provision, then run with `--force`. Expect:
    - exit 0;
    - the stored `cert` differs from the first one;
    - the `.crt` equals the new stored `cert`.
  - `fails when the read-back differs, leaving no key or certificate`: a
    blank board with `FAKE_CORRUPT_READBACK=1`. Expect:
    - exit 1, with stderr containing `could not be confirmed`;
    - no `.key`, no `.crt`, no temporary folder.
  - `with --force, a failed run keeps the previous certificate record`:
    provision, save the `.crt`, then run `--force` with
    `FAKE_CORRUPT_READBACK=1`. Expect exit 1, and the `.crt` is
    byte-identical to the saved one.
  - `says to create the CA when it is missing`: an empty `--ca-dir` exits 1
    with `run scripts/dev-certs.sh first`.
  - `says when the board is not connected`: without `PROVISION_IDF_SH` and
    with `ESPPORT=/nonexistent/ttyUSB9`, expect exit 1 with
    `no board on /nonexistent/ttyUSB9`.

  Run: `pnpm test:e2e backend/e2e/provision-device.e2e.ts`
  Expected: the cases Task 1 didn't build fail.

- [ ] **Step 2: Implement what fails**

  - **Refusal:** the message is
    `the board already has an identity (certificate SHA256 <fp>); --force replaces it on the board`.
    It is followed by a second line: `the old certificate is not revoked:
    it still connects for this MAC`. The fingerprint comes from the parsed
    `cert`: write it into the temporary folder, then run
    `openssl x509 -fingerprint -sha256` on it.
  - **Saving the record:** before calling `dev-certs.sh`, if the `.crt`
    exists, copy it to `previous.crt` in the temporary folder. `cleanup`
    puts it back when the run didn't succeed.
  - **Port check:** fail with `no board on <port>; plug it in or set ESPPORT`.

  Run: the Step 1 command. Expected: PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add scripts/provision-device.sh backend/e2e/provision-device.e2e.ts
  git commit -m "Refuse to replace a board's identity without --force"
  ```

### Task 3: Docs and checking on the board

**Files:**
- Modify: `firmware/README.md`, `CLAUDE.md`

- [ ] **Step 1: Provision the real board.** It must be plugged in: check
  `ls /dev/ttyUSB0`, and if it's missing, ask the owner to connect it.
  Run: `scripts/provision-device.sh`
  Expected: exit 0, and the board's MAC `24:DC:C3:8D:3E:0C` is printed.

- [ ] **Step 2: Read it back.**
  `firmware/scripts/idf.sh exec esptool read-flash 0x19000 0x3000 build/id.bin`,
  then `nvs_tool.py -f json -d minimal build/id.bin`. Expected: `identity/cert`
  and `identity/key`. Delete `firmware/build/id.bin` afterwards, since it
  holds the key.

- [ ] **Step 3: The identity survives a flash.**
  `firmware/scripts/idf.sh flash`, then repeat Step 2. Expected: the same
  entries.

- [ ] **Step 4: A second run is refused, `--force` replaces it.**
  - `scripts/provision-device.sh`: exit 1, `already has an identity`;
  - `scripts/provision-device.sh --force`: exit 0, with a new fingerprint.
  - The board ends up provisioned.
  - `ls certs/devices/` shows `24-DC-C3-8D-3E-0C.crt` and no `.key`.

- [ ] **Step 5: Write the docs.**
  - `firmware/README.md` gets a "Provisioning" section:
    - the command, with `--ca-dir` and `--force`;
    - the format table (namespace `identity`: `cert`, `key`, PEM strings);
    - the key is deleted after provisioning, so after `erase-flash` you
      provision again with a new key;
    - the old certificate is not revoked.
  - `CLAUDE.md`'s identity bullet names `scripts/provision-device.sh`.

- [ ] **Step 6: Run everything.**
  Run: `pnpm lint && pnpm typecheck && pnpm test`
  Expected: all pass.

- [ ] **Step 7: Commit**

  ```bash
  git add firmware/README.md CLAUDE.md
  git commit -m "Document provisioning a board"
  ```
