# Firmware: sending IR codes — design

Date: 2026-10-27 · Branch: a new branch off `main`

## Intent

The board can learn buttons. Pressing one (`POST /buttons/:id/press`) makes
the backend send `sendIr` with the button's timings, and today the board
answers `INVALID_COMMAND`. This change makes it transmit the code from its IR
LEDs and confirm it with `sendIrResult`.

It also adds `ir selftest`. The board listens with its own receiver, sends a
fixed code from its LEDs (which sit right next to the receiver), and says
whether what it heard matches. That checks the whole IR hardware without a
remote or a person. The owner works with the board remotely.

## Decided by the owner

- **Send IR now.** The owner asked for it directly after reading was done.
- Proposed by the builder and taken as accepted (the owner asked to proceed
  and works remotely; these are the builder's calls, listed for review):
  - **The LEDs:** the RMT's transmitter on **GPIO 13** (V1's `IR_OUTPUT`,
    driving the 8 IR LEDs through the transistor), with a **38 kHz carrier
    at 33% duty**.
  - **The RMT's last memory block:** sending uses the one block reading left
    free (64 symbols). The driver refills it while sending, so long codes go
    out whole.
  - **Converting timings to RMT symbols** is `core`'s, unit-tested:
    - a mark or space over the RMT's 32 767-tick limit is split;
    - a `0` entry (the protocol's spacer inside very long gaps) joins the
      spaces around it.
  - **Replies:** `sendIrResult` once the code has been transmitted, or
    `SEND_FAILED`.
  - **`BUSY`** while a read, another send or the self-test is running, so
    the board never reads its own transmission as a learned code.
  - **`ir selftest`:** a permanent console command.

## Goals

- **One reply per `sendIr`:**
  - `sendIrResult { commandId }` once the RMT has finished;
  - `error` with `SEND_FAILED` if transmitting fails;
  - `BUSY` if something else is using IR.
- **The transmitted signal is the code:** each mark is 38 kHz bursts for its
  duration, and each space is off. The LEDs are off after the code
  (end-of-transmission level 0).
- **`ir selftest`:**
  - it starts a console read;
  - it sends a fixed NEC-shaped test code (the one the simulator and the
    loopback used);
  - it compares what it heard with what it sent: every timing must be within
    25% or 200 µs, whichever is larger;
  - it prints `IR self-test: OK (sent 67 timings, heard 67)`, or
    `IR self-test: FAILED — …` with what went wrong (heard nothing, a
    different length, or the first timing that differs).
- **Tests:**
  - **unit:** the conversion and every `Device` rule;
  - **Linux e2e:** learn a button, then press it through the real API; the
    stand-in transmitter recorded exactly those timings, and the command
    succeeded;
  - **on the board:** `ir selftest` passes, and pressing a learned button
    through the API succeeds.

## Non-goals

- **Carrier frequencies other than 38 kHz,** or a carrier per button. The
  data model has none, and V1 and the design both fixed 38 kHz.
- **Repeating a code while a button is held,** and LED feedback.
- **Any backend, protocol or contract change.** `sendIr`, `sendIrResult` and
  `SEND_FAILED` already exist.

## Anti-goals

- A `sendIr` with no reply, or two.
- The receiver reading the board's own transmission as a learned code.
- The LEDs left on after a send.

## The design

### `core`

- **`protocol`:** `decode_server_message` fills `timings` for `SendIr`.
  Entries outside 0–65535, or a missing array, make it `Unknown`. Add
  `encode_send_ir_result(command_id)`.
- **`ir_symbols`:**
  `std::vector<IrSymbol> to_ir_symbols(const std::vector<uint16_t>& timings)`,
  where `IrSymbol` is `{ bool mark; uint16_t duration; }` and each duration
  is ≤ 32767.
  - Consecutive same-level entries merge: a `0` joins the spaces on either
    side of it.
  - Then anything over 32767 is split into pieces of at most 32767.
  - A leading or trailing space is dropped (a code starts and ends with a
    mark; a trailing gap is meaningless).
- **A port `IrSender`:** `send(std::vector<IrSymbol>)`, reported back with
  `Device::on_ir_sent(bool ok)`.
- **`Device`:**
  - **`sendIr` (connected):**
    - if a read, a send or the self-test is running, reply `BUSY`;
    - else note the send, call `ir_sender.send(to_ir_symbols(timings))`, and
      print `sending an IR code: N timings`.
  - **`on_ir_sent(ok)`** replies `sendIrResult` or `SEND_FAILED`, and ends
    the send.
  - **A link that closes mid-send:** the send finishes (the hardware can't be
    stopped halfway sensibly), and no reply is sent; the backend fails the
    command itself.
  - **`readIr` while sending:** `BUSY`.
  - **`ir selftest` (console):**
    - refused while busy;
    - otherwise it starts a read of kind `SelfTest` (10 s), and then sends
      the test code;
    - when the read finishes it compares and prints;
    - a send failure prints `IR self-test: FAILED — could not send`.
  - **`status`:** the IR line also shows `sending` and `self-test`.

### The board

- **`RmtIrSender : core::IrSender`** (in `board`):
  - an RMT TX channel on GPIO 13: 1 MHz, `mem_block_symbols` 64,
    `trans_queue_depth` 1;
  - the carrier at 38 kHz, duty 0.33;
  - a copy encoder; end-of-transmission level 0.
- **`send`** hands the symbols to its own task. That task packs them into
  `rmt_symbol_word_t` pairs (an odd count gets a zero-length partner),
  transmits, waits with `rmt_tx_wait_all_done` (a timeout of the code's
  length + 1 s), and posts `on_ir_sent`.
- **Init order:** the receiver is created first with its 7 blocks, then the
  sender takes the last block. The builder verifies the driver places them
  that way.

### The Linux stand-in

- `FileIrSender` appends each sent code to `AIRREMOTE_IR_SENT_FILE` as one
  line of comma-separated timings. It reconstructs them from the symbols, so
  the e2e test checks the conversion end to end. Then it reports `ok` after
  the code's duration.
- **For the self-test on Linux,** the stand-in sender also feeds the stand-in
  receiver: it plays the code as parts in real time, as `FileIrReceiver`
  does. So `ir selftest` works in the e2e tests too.

### Tests

- **Unit:**
  - `to_ir_symbols`:
    - a plain code;
    - a 0 spacer joining spaces;
    - a 70 000 µs space split as 65535,0,4465 to 32767,32767,4466;
    - a single 40 000 µs mark split;
    - a trailing space dropped.
  - Decoding `sendIr` timings.
  - **`Device`:**
    - `sendIr` calls the sender once, and `on_ir_sent(true)` gives
      `sendIrResult`;
    - `false` gives `SEND_FAILED`;
    - `BUSY` during a read, during a send and during the self-test;
    - `readIr` during a send gives `BUSY`;
    - a link close mid-send gives no reply.
  - **The self-test:**
    - passes on an echo of the code;
    - fails on silence ("heard nothing");
    - fails on a code with a wrong timing, naming it;
    - fails on a send failure.
- **Firmware e2e:**
  - learn a button with `pressIr`, press it through the API: the command
    succeeds, and the sent file's last line equals the button's timings;
  - `ir selftest` prints `IR self-test: OK …`.
- **On the board:**
  - `ir selftest` passes;
  - pressing a button learned by loopback, through the API, succeeds;
  - the receiver's 448 blocks plus the sender's 64 coexist (no allocation
    error at boot).

## Left to the builder

- File and class names.
- The test code's exact timings, NEC-shaped.
- Task priority and stack sizes.
