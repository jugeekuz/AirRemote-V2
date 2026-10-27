# IR sending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sendIr` transmits the code from the IR LEDs and answers
`sendIrResult` / `SEND_FAILED` / `BUSY`; `ir selftest` checks send and receive
on the board itself.

**Architecture:**
- **`core`:** `to_ir_symbols` and protocol additions; `Device` drives a new
  `IrSender` port and runs the self-test.
- **`board`:** an RMT TX driver on GPIO 13.
- **`linux/`:** a stand-in sender that records codes, and echoes them into
  the stand-in receiver for the self-test.

**Tech Stack:** ESP-IDF v6.0.3 RMT TX, C++, Unity, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-ir-sending-design.md`

## Global Constraints

- **Rules:** `core` platform-free; one task runs `Device`; one reply per
  command.
- **RMT TX:**
  - GPIO 13; 1 MHz; `mem_block_symbols` 64;
  - carrier 38 kHz at duty 0.33;
  - EOT level 0.
- **Symbols:** at most 32767 µs each; a `0` joins the spaces around it; a
  leading or trailing space is dropped.
- **Self-test:**
  - the NEC-shaped test code from `tools/device-sim` (`SAMPLE_TIMINGS_US`);
  - a match is every timing within max(25%, 200 µs);
  - the lines are `IR self-test: OK (sent N timings, heard M)` and
    `IR self-test: FAILED — <reason>`.
- **Commits** end with the `Co-Authored-By` and `Claude-Session` lines.
- **Done means** these all pass: `firmware/scripts/test.sh`,
  `firmware/scripts/idf.sh build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Review Focus

1. **A `sendIr` while the self-test reads:** `BUSY`, and the self-test isn't
   corrupted.
2. **A link close mid-send:** no reply, and the next `sendIr` works.
3. **A `sendIr` whose timings are garbage** (negative, over 65535, not an
   array): treated as `Unknown` and ignored, as the backend validates them
   anyway.
4. **The LEDs are off after any send,** success or failure.
5. **The RX and TX channels both allocate at boot** (7 + 1 blocks).

---

### Task 1: `to_ir_symbols` and the protocol

- [ ] **Failing tests** (`test_ir_symbols.cpp`, `test_protocol.cpp`):
  - the spec's `to_ir_symbols` cases;
  - `decode_server_message(sendIr)` gives `timings`, and garbage gives
    `Unknown`;
  - `encode_send_ir_result`.
- [ ] **Implement:** `include/core/ir_symbols.hpp`, `src/ir_symbols.cpp`, and
  the protocol additions. Commit: "Turn IR timings into RMT symbols".

### Task 2: `Device` sends, and the self-test

- [ ] **Failing tests** (`test_device.cpp`, `FakeIrSender`), covering every
  `Device` and self-test case in the spec. The self-test echo is driven with
  `play()`.
- [ ] **Implement:**
  - the port `IrSender { send(std::vector<IrSymbol>) }`;
  - `Device::on_ir_sent(bool)`;
  - `Read::For::SelfTest`;
  - `Command::Kind::IrSelfTest` (`ir selftest`);
  - no-op senders in both apps until Tasks 3–4.

  Commit: "Send IR codes and test IR on the board itself".

### Task 3: The Linux stand-in sender, e2e

- [ ] **Failing e2e tests** (`firmware/e2e/ir.e2e.ts`):
  - learn with `pressIr`, then press the button through the API: the
    command succeeds, and the last line of the sent file equals the
    button's timings;
  - `ir selftest` prints `IR self-test: OK`.
- [ ] **Implement:**
  - `linux/main/file_ir_sender.*`, which appends to `AIRREMOTE_IR_SENT_FILE`
    (timings rebuilt from the symbols);
  - `FileIrReceiver::play(parts)`, shared by the file and the sender's echo;
  - `firmware-app.ts`'s `sentIr()` reading the file.

  Commit: "Send IR on the Linux build".

### Task 4: The RMT sender and the board

- [ ] **Implement** `board/ir_sender.*` (`RmtIrSender`), and wire it into
  `main.cpp` after the receiver.
- [ ] **On the board:**
  - no allocation errors at boot;
  - `ir selftest` prints OK;
  - pressing a button learned through the API succeeds.
- [ ] **Docs:** the README covers sending, `ir selftest` and GPIO 13.
  Commit: "Send IR on the board's RMT".
