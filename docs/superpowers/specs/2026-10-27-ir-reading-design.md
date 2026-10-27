# Firmware: reading IR codes — design

Date: 2026-10-27 · Branch: a new branch off `main`

## Intent

The board is connected and enrolled, but it answers every IR command with
`INVALID_COMMAND`. This change makes it read IR. When the backend sends
`readIr` (a user is learning a button), the board listens with its IR
receiver and answers with the code's raw timings. The backend then stores
them as the button.

V1 could learn some air-conditioner remotes but not others, and nobody knows
why for sure. The likely causes are V1's 15 ms end-of-code silence (which
splits codes sent in several parts) and its 1024-timing buffer. This design
ends codes after 50 ms of silence instead, and allows up to 2048 timings. It
also adds a console command, `ir`, that prints exactly what the board
captured, so real remotes can be checked rather than guessed at.

## Decided by the owner

- **Reading only.** `sendIr` keeps answering `INVALID_COMMAND` until sending
  is built.
- **The receiver is on GPIO 2**, as in V1 (`legacy/firmware/src/main.cpp`:
  `IR_INPUT 2`; the IR LEDs are on 13, for later).
- **A code ends after 50 ms of silence** and may be up to 2048 timings, the
  protocol's limit. (Proposed and accepted.)
- **An `ir` console command** listens for one code and prints its parts, the
  gaps between them, the number of timings and the timings themselves. It
  doesn't involve the backend.
- From the proposal the owner accepted:
  - **Busy:**
    - `readIr` while another read or `ir` is running gets `BUSY`;
    - `ir` while reading says the board is busy.
  - **Too short:** a capture under 6 timings is ignored as noise or a lone
    "still held" frame, and listening goes on.
  - **Too long:** over 2048 timings, it's `CAPTURE_TOO_LONG`.
  - **No code:** if nothing arrives within `readIr`'s `timeoutMs`, it's
    `READ_TIMEOUT`. `ir` listens for 10 s.
  - **Link drops:** if the link closes during a `readIr`, listening stops.
  - **The Linux build gets a stand-in receiver** that end-to-end tests feed
    codes into through a file only the Linux app reads.
  - **The board is checked once** with the owner's TV remote and the
    air-conditioner remote that failed in V1.

## Goals

- `readIr` gets exactly one reply:
  - `readIrResult` with the code's timings;
  - or an `error` with `READ_TIMEOUT`, `CAPTURE_TOO_LONG` or `BUSY`.
- The timings follow `irTimingsSchema`: microseconds, alternating mark and
  space, starting with a mark, ending with a mark, 1–2048 entries, each
  0–65535. With a 50 ms end, no gap exceeds 65535, so the `0` spacer never
  appears.
- Parts less than 50 ms apart are one code. The silence between them is kept
  as the space between them, so a replay reproduces the original spacing.
- `ir` prints a readable summary and the timings, in a form that can be
  pasted straight back into the protocol.
- The capture logic lives in `core` and is unit-tested with recorded example
  codes. The Linux end-to-end tests show a learned button stores exactly the
  timings the receiver saw.
- Checked on the real board with two real remotes.

## Non-goals

- Sending IR, the LEDs and the button.
- Decoding protocols (NEC, Sony, …) or measuring the carrier frequency. The
  TSOP removes the carrier, and the backend may decode later.
- Changing the backend, the protocol or the contracts. The backend already
  maps `READ_TIMEOUT` to `IR_READ_TIMEOUT`, `CAPTURE_TOO_LONG` to
  `IR_CODE_TOO_LONG`, and `BUSY` to `DEVICE_BUSY`.
- Filtering NEC repeat frames beyond the 6-timing minimum.

## Anti-goals

- **Logic that can only be tested on the board.** The driver only reports
  pulses and timestamps. Stitching, limits and replies are `core`'s.
- **A `readIr` that gets no reply,** or two replies.
- **Using up all of the RMT's memory for receiving,** leaving nothing for
  sending later.

## Constraints

- **The ESP32's RMT:**
  - 8 memory blocks of 64 symbols, shared by every channel. Receiving here
    takes **7 blocks (448 symbols, up to 896 timings per RMT capture)**,
    leaving one block for the sending channel later (my call).
  - No ping-pong receive on the classic ESP32, so one RMT capture can't be
    longer than its buffer.
  - At 1 MHz resolution, one symbol half can measure at most 32 767 µs. The
    receiver is told to end a capture after **30 ms** of silence.
- **The TSOP38238's output is low while it sees the carrier.** Low means
  "mark".
- `core`'s rules from `CLAUDE.md` apply: no ESP-IDF headers; hardware behind
  abstract interfaces; one task.

## The design

### How a code is captured

1. **The driver** (`board`, on the chip) runs RMT receive on GPIO 2 at 1 MHz:
   - a glitch filter of about 1 µs (the builder picks the exact value within
     the RMT's limits);
   - `signal_range_max` of 30 ms;
   - the input inverted, so a mark reads as level 1.

   Each finished RMT capture is one **part**. In the `on_recv_done` ISR it
   copies the symbols and takes the time from `esp_timer_get_time()`. On its
   own task (not the ISR) it turns them into durations: mark, space, …, mark,
   with the 30 ms idle that ended the capture dropped. Then it posts the part
   to `Device` with **`ended_at_us`**: the time the last mark ended, which is
   the ISR time minus the 30 ms idle.
2. **A part whose RMT buffer filled up** (448 symbols) is reported as
   *overflowed*.
3. **`core` assembles parts into a code (`IrCapture`):**
   - the first part starts a code;
   - each next part is joined if its start (`ended_at_us` minus its total
     duration) is less than 50 ms after the previous part's end. The silence
     between them becomes one space entry.
   - A part 50 ms or more after the previous one can't happen while waiting,
     because the code is finished first (see 4). If it races in anyway, it
     starts a new code after the finished one has been handled.
4. **Finished:** `Device` schedules an `IrSilence` timer for 50 ms after the
   last part's end. When it fires, the code is finished:
   - under 6 timings: discarded, and listening continues;
   - over 2048, or any part overflowed: too long;
   - otherwise: a code.
5. **Listening stops** (`IrReceiver::stop()`) when a code, too-long or the
   timeout ends a read, or when the link closes during a `readIr`.

### `core` changes

- **A port `IrReceiver`:** `start()` and `stop()`. It reports back with
  `Device::on_ir_part(std::vector<uint16_t> timings, int64_t ended_at_us,
  bool overflowed)`. Each timing is clamped to 65535 by the driver; a single
  mark or space can't exceed the 30 ms RMT limit anyway.
- **`Timers`** gets a clock in µs, or `now_ms` is enough: the builder decides,
  as long as `ended_at_us` and the timer clock are the same clock. On both
  targets that's the monotonic `esp_timer_get_time()` (on Linux, the existing
  shim). The fake clock in tests drives both.
- **New `TimerId`s:** `IrSilence` and `IrDeadline` (the `readIr` timeout and
  `ir`'s 10 s).
- **`IrCapture`:** a small class with `add(part…)` and `finish() -> result`,
  unit-tested on its own.
- **`Device`:**
  - `readIr` while connected:
    - if a read is running, reply `BUSY` (with the command's id);
    - else start one for `commandId`, and schedule `IrDeadline` for
      `timeoutMs`.
  - `ir` typed while idle starts a console read with a 10 s deadline; while
    busy it prints `busy — already reading an IR code`.
  - **Result of a `readIr`:** `readIrResult { commandId, timingsUs }`, or
    `error` with `CAPTURE_TOO_LONG` or `READ_TIMEOUT` and the `commandId`.
  - **Result of `ir`**, printed:
    - `IR code: 3 parts, gaps 34 ms, 35 ms; 583 timings` (`1 part; 67
      timings` for a single part)
    - `timings: 9000,4500,560,…` (one line)
    - or `IR: no code in 10 s`, or `IR: code too long (over 2048 timings)`.
  - **On link close during a `readIr`:** stop listening, and send nothing
    (the backend fails the command itself when a device disconnects).
  - **`status`** shows `IR         idle | reading (backend) | reading (console)`.
- **`protocol`:** an `encode_read_ir_result(command_id, timings)` and
  `decode_server_message` returning `ReadIr`'s `timeoutMs`.

### The Linux stand-in

- With `AIRREMOTE_IR_FILE` set, a `FileIrReceiver` polls that path every
  50 ms while it's listening. When it finds the file, it reads it, deletes
  it, and reports its parts.
- One line per part, as comma-separated timings. A line `gap <ms>` between
  two parts sets the silence between them (default 0 ms gap means "right
  after"). It reports each part with `ended_at_us` computed from now and the
  gaps, so `core`'s stitching sees what it would see on the chip.
- Without the variable, it never reports anything.

### Tests

- **Unit (`core/host_test`):**
  - **`IrCapture`:**
    - a single NEC code;
    - a Sony code sent three times 45 ms apart, which is one code;
    - an air-conditioner-like code in 3 parts with 35 ms gaps, which is one
      code with the gaps kept as spaces;
    - two parts 60 ms apart: only the first is in the code;
    - 5 timings: ignored;
    - exactly 2048: a code; 2049: too long; an overflowed part: too long.
  - **`Device`:**
    - `readIr` starts the receiver;
    - a code gives exactly one `readIrResult` with those timings, and stops
      the receiver;
    - the timeout gives `READ_TIMEOUT` once;
    - a second `readIr` gives `BUSY`;
    - `ir` during a `readIr` is refused;
    - `readIr` during `ir` gives `BUSY`;
    - the link closing stops the receiver and sends nothing;
    - noise followed by a code gives the code;
    - `ir`'s printed lines;
    - `status`.
  - **`protocol`:** encoding `readIrResult` and decoding `timeoutMs`.
- **Firmware e2e (`pnpm test:firmware`), through the real backend:**
  - learning a button while the test writes a code to the IR file stores a
    button with exactly those timings (multi-part, with the gap kept);
  - learning with no code ends with `IR_READ_TIMEOUT`;
  - `ir` with a code fed in prints the summary line and the timings.
- **On the board:**
  - `ir` with the TV remote, then the air-conditioner remote;
  - learning a button through the API with each;
  - recording what they look like (parts, gaps, length) in the PR/commit
    message, for tuning the 50 ms later.

### Docs

- `firmware/README.md`:
  - the `ir` command;
  - how a code is captured: 50 ms, 2048, 6;
  - GPIO 2.
- `CLAUDE.md`: nothing new beyond what the conventions already say, unless
  the builder adds a component.

## Left to the builder

- Class and file names, and whether the IR driver goes in `board` or its own
  component.
- The glitch filter value and the RMT task/queue details, within the limits
  above.
- How the Linux stand-in's file is written and polled, within the format
  above.
- The exact `status` wording.

## Resolved after the builder check (the builder's calls, owner pre-approved)

- **Held keys.** With a 50 ms join, a press longer than about 110 ms stores
  extra frames:
  - an NEC code gets one repeat frame;
  - a Samsung32 code gets a second full frame;
  - a Sony code sends its three frames 45 ms apart, so they merge into one
    RMT part, and holding it for about 0.8 s or more fills the buffer, which
    gives `CAPTURE_TOO_LONG`.

  Each of these replays as a short press, so the rule stays. The README tells
  people to press briefly. The board check with `ir` decides whether to
  change it later.
- **The Linux IR file:** two parts with no `gap` line between them are 30 ms
  apart, the shortest gap the chip can report as separate parts. A `gap`
  under 30 is rejected as unparseable.
- **A deadline with a code half captured:** if `IrDeadline` fires while a
  code is half captured (parts in, silence not yet over), the read waits for
  the silence. A `Code` or `TooLong` result is the answer; `TooShort` becomes
  `READ_TIMEOUT`.
- **The longest code:** a code starts and ends with a mark, so its length is
  odd and the most it can be is **2047**. Tests: 2047 is a code, 2049 is too
  long.
- **The clock:** `Timers` gains `now_us()` on `esp_timer_get_time()` (the
  Linux shim on Linux). `ended_at_us` and `now_us` are the same clock;
  `now_ms` stays for the existing timers.
- **Stopping on a dropped link:** a `readIr` also stops when `Device` drops
  the link itself (`drop_link`: a Wi-Fi change or Wi-Fi down), because
  `Link::close()` reports nothing. A console `ir` doesn't depend on the link.
- **Re-arming the receiver:** it gets only ~5 ms between parts 35 ms apart.
  The ISR re-arms it with a second buffer, alternating between two buffers
  (`CONFIG_RMT_RECV_FUNC_IN_IRAM=y`); the task copies out the finished one.
- **A full buffer:** a capture of 447 or more symbols is treated as
  overflowed. The board check verifies how the v6 driver reports a full
  buffer on the classic ESP32. One RMT part holds at most about 895 timings.

## Corrected after the final review

**When a code ends.** Step 4 above is wrong for the chip. A part is reported
only 30 ms after it ends, so a silence timer at "the last part's end + 50 ms"
always fires before the next part can be reported, and multi-part codes would
be cut to their first part.

Instead, the receiver also reports **activity**: on the board, a GPIO edge
interrupt on the RX pin records when it last saw an edge. A code ends once
50 ms have passed with no activity, plus the 30 ms report delay. Activity
after the code so far means a part is still on the air, so `Device` keeps
waiting.

A read can run at most 2 s past its deadline, even under steady IR. The
capture stops growing past 2048 timings. This was verified on the board: a
three-part loopback code with 35 ms gaps came back as one code with both
gaps, and a 600-pulse burst gave "too long".
