# Provisioning a board's identity — design

Date: 2026-10-27 · Branch: a new branch off `main`

## Intent

A real board needs the same thing the simulator has: a private key and a
certificate whose CN is its MAC address, signed by the device CA. Without them
the device listener won't let it connect over mTLS. This change adds one
command that gives a connected board its identity. It is "option A" from the
firmware foundations design
(`docs/superpowers/specs/2026-10-27-firmware-scaffold-design.md`): the key is
made on the developer's machine, written to the board's `identity` partition,
and then deleted from the machine.

No firmware reads the identity yet; that comes with the feature that connects.
This change fixes the format that feature will read.

## Decided by the owner

- **Option A:** the key is generated on the computer and written to the
  `identity` partition. Option B (key made on the device) comes later.
- **The private key is deleted from the computer once the board has it.**
  There is no reuse: a board that loses its identity (e.g. `erase-flash`) is
  provisioned again with a new key.
- From the proposal the owner accepted:
  - **`scripts/provision-device.sh`**, next to `dev-certs.sh`;
  - **the MAC is read from the board.** The certificate is issued the way
    `dev-certs.sh device <MAC>` does it;
  - **the default CA is the dev CA in `certs/`**, with a flag for another CA
    directory;
  - **it refuses a board whose `identity` already holds something**, unless
    `--force` is passed;
  - **it writes only the identity.** Flashing the firmware stays
    `firmware/scripts/idf.sh flash`;
  - **it reads the partition back** to check what was written.

## Goals

- `scripts/provision-device.sh [--ca-dir DIR] [--force]` provisions the board
  on `ESPPORT` (default `/dev/ttyUSB0`) in one run.
- Afterwards:
  - the board's `identity` partition holds the key and certificate in the
    format below;
  - the certificate verifies against the CA and its CN is the board's MAC in
    upper case;
  - `<ca-dir>/devices/<MAC with dashes>.crt` (e.g. `24-DC-C3-8D-3E-0C.crt`,
    the name `dev-certs.sh` uses) stays on the computer as a record;
  - no copy of the key is left anywhere on the computer, including temporary
    files, and also when the run fails.
- It runs entirely through `firmware/scripts/idf.sh` (Docker) and the host's
  `openssl`, which `dev-certs.sh` already needs. Nothing new is installed.
- Tested automatically without a board, and checked once on the real board.

## Non-goals

- Firmware code that reads `identity`.
- Flashing the firmware, or erasing anything other than writing `identity`.
- Registering the device with the backend: enrollment already handles that.
- Option B, a production CA, revocation, or batch provisioning.
- Generating the dev CA. When the CA is missing, the script says to run
  `scripts/dev-certs.sh` (the same message `dev-certs.sh device` gives).

## Anti-goals

- A private key left on disk after any run, successful or not.
- Overwriting an existing identity without `--force`.
- Two copies of certificate-issuing logic: the certificate comes from
  `dev-certs.sh`, called as a subprocess.
- The partition's offset and size typed into the script a second time.

## The design

### What goes on the board

An NVS partition image of the `identity` partition's size, made with ESP-IDF's
generator (`python -m esp_idf_nvs_partition_gen generate <csv> <bin> <size>`
in the v6.0.3 image), with one namespace and two entries:

| Namespace  | Key    | Type   | Value                                      |
| ---------- | ------ | ------ | ------------------------------------------ |
| `identity` | `cert` | string | the device certificate, PEM                |
| `identity` | `key`  | string | its EC P-256 private key, PEM              |

PEM strings are my call. They're small (≈ 600 and 250 bytes, well under
NVS's 4000-byte string limit), readable when debugging, and `esp-tls` takes
PEM directly. The CA certificate is not included: the server CA is built into
the firmware, as decided before.

### Where `identity` is

The script reads the offset and size from the `identity` line of
`firmware/partitions.csv`, so there is one source. If the line is missing,
the script fails.

### The steps

1. **Check:**
   - the CA (`<ca-dir>/device-ca.crt` and `.key`) exists;
   - `openssl` exists;
   - the port exists, with a plain message if not.
2. **Read the MAC** with `idf.sh exec esptool read-mac`, then upper-case it.
3. **Read `identity`** with `esptool read-flash <offset> <size> <file under
   /project/build/…>`, and parse it as NVS with
   `components/nvs_flash/nvs_partition_tool/nvs_tool.py -f json`. **The board
   has an identity when namespace `identity` holds `cert` or `key`.** Blank
   flash, leftovers from older firmware (V1's app overlapped this range), or
   an empty NVS layout all count as no identity. This is my call: a byte-level
   "all 0xFF" rule would refuse most first-time boards. Without `--force`, a
   board with an identity stops with "the board already has an identity
   (certificate <fingerprint>); --force replaces it on the board". The old
   certificate is not revoked: it still passes mTLS for that MAC until
   revocation exists.
4. **Issue the certificate:** `scripts/dev-certs.sh --out <ca-dir> device <MAC>`,
   with its output hidden, since it prints the key's path. If a `.crt` record
   for that MAC already exists, it is copied aside first. On any failure
   before the read-back passes, the copy is put back, so `--force` never
   loses the old record while the board may still hold the old identity
   (my call).
5. **Copy the key and certificate into the temporary folder** (the container
   sees only `firmware/`) and **build `identity.bin`** from a CSV that points
   at them by their `/project/build/…` paths.
6. **Write it** with `esptool write-flash <offset> identity.bin`.
7. **Read it back** and compare byte for byte. A mismatch fails the run.
8. **Delete the key** and every temporary file. Print the MAC, the
   certificate's path and fingerprint, and the next step: enroll the device.

**Temporary files.** They live in a fresh folder under `firmware/build/`,
because the container sees only `firmware/` and `build/` is git-ignored. That
folder holds the key in three forms: the PEM copy, `identity.bin` and the
read-back. An `EXIT` trap deletes the whole folder and
`<ca-dir>/devices/<MAC>.key` on every exit, including errors and Ctrl+C. On
failure, the new certificate is deleted (or the previous record put back).

**If the write succeeds but the read-back fails,** the board's state is
unknown. The script says so, deletes the key as always, and suggests running
again with `--force`.

### Tests

- **Automatic:** `backend/e2e/provision-device.e2e.ts`, next to
  `dev-certs.e2e.ts`, with a throwaway CA from `dev-certs.sh --out <tmp>`.
  The board is faked. The script calls `idf.sh` through a path that a test
  can override, the `PROVISION_IDF_SH` environment variable (my call).
  - The fake answers `esptool read-mac`, `read-flash` and `write-flash`
    against a local "flash" file.
  - It forwards everything else, i.e. the NVS generator and parser, to the
    real `firmware/scripts/idf.sh` in Docker, with `ESPPORT` pointed at a path
    that doesn't exist. Otherwise the real board on `/dev/ttyUSB0` would be
    handed to the container.
  - These tests run Docker, so they need a longer timeout than Vitest's
    default 5 s.
  - Cases:
    - On a blank board, the written image parses (ESP-IDF's `nvs_tool.py`)
      to namespace `identity` with `cert` and `key`. The certificate verifies
      against the CA with CN = the fake MAC in upper case, and the key
      matches the certificate. No `.key` file is left in the CA directory,
      the temporary folder under `firmware/build/` is gone, and the `.crt`
      is kept.
    - A board whose `identity` holds random bytes (old firmware) is
      provisioned without `--force`.
    - A provisioned board is refused with exit 1 and nothing is written.
      With `--force` it is replaced.
    - When the read-back differs (the fake corrupts it), the run fails and
      no key is left. On a fresh board no certificate is left; with
      `--force` the previous record is back unchanged.
    - Without a CA, it fails and says to run `scripts/dev-certs.sh`.
- **On the board, once:** provision it, then:
  - read the partition with `nvs_tool.py` and see both entries;
  - run `idf.sh flash` and see the identity survive;
  - run the script again and see it refuse;
  - run it with `--force` and see it work.

### Docs

- `firmware/README.md`: a "Provisioning" section with the command, the
  format table, and the warning that `erase-flash` means provisioning again.
- `CLAUDE.md`'s firmware conventions point to the script.

## Left to the builder

- The exact output wording, beyond the messages quoted above.
- How the fake `idf.sh` is written, as long as only the board is faked.
- Whether the e2e test lives in `backend/e2e/` or a new e2e folder for
  repository scripts, within the root Vitest config's e2e project.
