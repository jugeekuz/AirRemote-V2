# IR reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board answers `readIr` with a captured code's timings (or
`READ_TIMEOUT` / `CAPTURE_TOO_LONG` / `BUSY`), and `ir` prints what it
captured.

**Architecture:**
- **`core`:** `IrCapture` joins RMT parts into codes (the 50 ms rule, 6 and
  2048 timings). `Device` drives a new `IrReceiver` port and two new timers.
- **The board:** an RMT driver on GPIO 2 reports parts with `ended_at_us`.
- **Linux:** a stand-in receiver reads parts from `AIRREMOTE_IR_FILE`, for
  the e2e tests.

**Tech Stack:** ESP-IDF v6.0.3 RMT RX, C++, Unity, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-ir-reading-design.md`

## Global Constraints

- **Rules:** `core` stays platform-free; the include check passes; one task
  runs `Device`.
- **Limits:**
  - a code ends after **50 ms** of silence;
  - under **6** timings is ignored;
  - over **2048**, or any overflowed part, is too long;
  - `ir` listens for **10 s**.
- **RMT:**
  - 1 MHz resolution;
  - `signal_range_max_ns` = 30 ms;
  - `mem_block_symbols` = 448 (7 of 8 blocks);
  - GPIO 2, input inverted.
- **Every `readIr` gets exactly one reply.** On a link close mid-read, the
  board stops listening and sends nothing.
- **The console lines:**
  - `IR code: N part(s)[, gaps A ms, B ms]; T timings`
  - `timings: a,b,c,…`
  - `IR: no code in 10 s`
  - `IR: code too long (over 2048 timings)`
  - `busy — already reading an IR code`
  - `listening for an IR code (10 s) …`
- **Every commit message ends with** the two attribution lines
  (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, then
  `Claude-Session: https://claude.ai/code/session_014khuw6sNjrFiXADKaattqm`).
- **Done means** these all pass: `firmware/scripts/test.sh`,
  `firmware/scripts/idf.sh build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Review Focus

1. **A code arriving in the same moment the deadline fires** must give one
   reply, not two (Task 2 test).
2. **Parts arriving after the read finished** (late ISR delivery) are ignored,
   or start nothing, while idle (Task 2 test).
3. **A `readIr` with a `timeoutMs` the board can't honour:** it uses what the
   server sent (1–60 s per the contract) (Task 2 test).
4. **Noise before the code** (a 2-timing blip) doesn't end the read (Task 1/2
   tests).
5. **The RMT buffer filling** (a part over 448 symbols) gives
   `CAPTURE_TOO_LONG`, never a truncated code (Task 1 test; driver flag).

---

### Task 1: `protocol` and `IrCapture`

**Files:**
- Modify: `firmware/components/core/include/core/protocol.hpp`,
  `src/protocol.cpp`
- Create: `include/core/ir_capture.hpp`, `src/ir_capture.cpp`
- Test: `host_test/main/test_protocol.cpp`, new `test_ir_capture.cpp`

**Interfaces (produces):**

```cpp
// protocol.hpp
std::string encode_read_ir_result(std::string_view command_id, const std::vector<uint16_t>& timings);
// ServerMessage gains: uint32_t timeout_ms = 0;   // ReadIr

// ir_capture.hpp
struct IrPart { std::vector<uint16_t> timings; int64_t ended_at_us; bool overflowed; };
class IrCapture {
 public:
  static constexpr int64_t kEndSilenceUs = 50000;
  static constexpr size_t kMinTimings = 6, kMaxTimings = 2048;
  // false: this part starts after the code had already ended (>= 50 ms gap); not added.
  bool add(const IrPart& part);
  bool empty() const;
  int64_t ended_at_us() const;          // end of the last part added
  struct Result { enum class Kind { Code, TooShort, TooLong } kind;
                  std::vector<uint16_t> timings; std::vector<int64_t> gaps_ms; size_t parts; };
  Result finish();                       // and resets
};
```

- [ ] **Step 1: Failing tests:**
  - **protocol:** `encode_read_ir_result` gives exactly
    `{"type":"readIrResult","commandId":"…","timingsUs":[9000,4500,560]}`,
    and decoding `readIr` gives its `timeout_ms`.
  - **`test_ir_capture.cpp`**, built from a helper that makes a part ending
    at a given time:
    - one NEC part (67 timings) gives `Code`, 1 part, the same timings;
    - a Sony part three times, each 45 ms after the previous end, gives one
      code: parts 3, the gaps as spaces (45000), and timings = p + [45000] +
      p + [45000] + p;
    - three parts 35 ms apart give one code with gaps_ms {35, 35};
    - a second part 60 ms after the first: `add` returns false;
    - 5 timings give `TooShort`; exactly 2048 give `Code`; 2049 give
      `TooLong`; an overflowed part gives `TooLong`;
    - a gap over 65535 µs can't be joined (it's ≥ 50 ms), so no spacer ever
      appears.

  Run `firmware/scripts/test.sh`. Expected: FAIL.

- [ ] **Step 2: Implement.** A part's start is `ended_at_us` minus the sum
  of its timings. The gap is that start minus the previous end, clamped
  to ≥ 0 (clock jitter). Join when the gap is under 50 ms. The joined space is
  the gap in µs, clamped to 65535 (always smaller anyway). Expected: PASS.
- [ ] **Step 3: Commit:** "Assemble IR captures into codes".

### Task 2: `Device` reads IR

**Files:**
- Modify: `core/include/core/ports.hpp` (an `IrReceiver` port; `TimerId`
  gains `IrSilence` and `IrDeadline`; `Timers` gains `int64_t now_us()`),
  `core/include/core/device.hpp`, `src/device.cpp`, `src/commands.cpp` (the
  `ir` command, in `kHelpLines`), `runtime` timers (`now_us` via
  `esp_timer_get_time`), the board and Linux `main.cpp` (pass a no-op
  receiver until Tasks 3–4)
- Test: `host_test/main/test_device.cpp`, `fakes.hpp`, `test_commands.cpp`

**Interfaces (produces):**

```cpp
struct IrReceiver { virtual ~IrReceiver() = default; virtual void start() = 0; virtual void stop() = 0; };
// Ports gains IrReceiver& ir;
// Device gains: void on_ir_part(IrPart part);
// Command::Kind gains Ir.
```

- [ ] **Step 1: Failing tests.** `FakeIr` counts starts and stops;
  `FakeTimers` gains `now_us`. The cases:
  - **`readIr` (connected):**
    - the receiver starts, and `IrDeadline` is scheduled with the command's
      `timeoutMs`;
    - a part, then advancing past 50 ms, gives exactly one `readIrResult`,
      and the receiver stops;
    - the deadline gives `READ_TIMEOUT` with the commandId, once, and the
      receiver stops;
    - a 2-timing part, then a code, gives the code;
    - a too-long code gives `CAPTURE_TOO_LONG`;
    - a second `readIr` gives `BUSY` and leaves the first running;
    - the link closing mid-read stops the receiver and sends nothing more;
    - a part arriving while idle is ignored;
    - a code finishing and the deadline expiring at the same instant give
      one reply.
  - **`ir`:**
    - it prints `listening for an IR code (10 s) …`;
    - a code prints the summary and `timings:` lines;
    - no code prints `IR: no code in 10 s`;
    - `ir` while reading prints `busy — already reading an IR code`;
    - `readIr` during `ir` gives `BUSY`;
    - `ir` works without Wi-Fi, a backend or an identity.
  - **`status`** has an `IR         idle|reading (backend)|reading (console)`
    line.
  - **`sendIr`** still gives `INVALID_COMMAND`.

  Expected: FAIL.

- [ ] **Step 2: Implement.**
  - One read at a time: `std::optional<Read> read_` holds
    `{ kind: Backend|Console; command_id; IrCapture capture; }`.
  - `on_ir_part`:
    - if idle, ignore it;
    - if `add` refuses it, finish the current code first and then add it;
    - otherwise schedule `IrSilence` at (`ended_at_us` + 50 ms − `now_us`),
      at least 1 ms.
  - On `IrSilence`, `finish()`:
    - `TooShort` keeps listening;
    - `Code` or `TooLong` replies or prints, then ends the read.
  - Ending a read cancels both timers and stops the receiver.

  Expected: PASS.
- [ ] **Step 3: Commit:** "Read IR codes for the backend and the console".

### Task 3: The Linux stand-in and e2e tests

**Files:**
- Create: `firmware/linux/main/file_ir_receiver.hpp`/`.cpp`.
  - While started, a FreeRTOS task polls `AIRREMOTE_IR_FILE` every 50 ms.
  - When found, it reads the file and deletes it.
  - It parses lines: timings, or `gap <ms>`.
  - It posts each part with `ended_at_us` laid out backwards from now: the
    last part ends now, and each earlier one ends its own duration plus the
    gap before the next part's start.
- Modify: `linux/main/main.cpp`; `firmware/e2e/support/firmware-app.ts` (an
  `irFile` in the container, plus `pressIr(parts)` writing it atomically:
  write a temp file, then rename); `firmware/e2e/connection.e2e.ts`, or a new
  `ir.e2e.ts`.

- [ ] **Step 1: Failing e2e tests:**
  - **learning stores the code:**
    - enroll and connect, create a remote, then `learn`;
    - as soon as the command is pending, `pressIr` with 3 parts (30, 30,
      30 timings) and gaps of 35 ms;
    - `pollUntilSettled` gives `succeeded`;
    - the stored button's `timingsUs` (read via `findButton` or the API)
      equals the parts joined by the gaps, within ±5 ms on each gap entry
      only.
  - **learning without a code gives `IR_READ_TIMEOUT`** (a `readIr` with
    the API's default timeout; shorten it with the device server's
    `deviceCommandTimings`, as learn-buttons does).
  - **`ir` prints what it captured:** typing `ir` and pressing a code prints
    `IR code: 1 part; 67 timings` and `timings: …` equal to the code.

  Expected: FAIL.
- [ ] **Step 2: Implement.** Expected: PASS (`pnpm test:firmware`).
- [ ] **Step 3: Commit:** "Feed IR codes to the Linux build in e2e tests".

### Task 4: The RMT driver, docs and the board

**Files:**
- Create: `firmware/components/board/include/board/ir_receiver.hpp`,
  `src/ir_receiver.cpp` (`RmtIrReceiver : core::IrReceiver`):
  - the RX channel on GPIO 2;
  - `on_recv_done` ISR copies `num_symbols` into a queue item (a static
    pool), with `esp_timer_get_time()`;
  - a task converts symbols into mark/space durations, merging same-level
    neighbours and dropping the trailing idle; it then posts `on_ir_part`
    with `ended_at_us` = ISR time − 30 ms and `overflowed` = `num_symbols`
    reached 448;
  - it re-arms `rmt_receive` while started;
  - `stop()` disables the channel.
- Modify: `firmware/main/main.cpp`; `firmware/README.md` (the `ir` command;
  how a code is captured; GPIO 2).
- [ ] **Step 1:** `firmware/scripts/idf.sh build` passes, then flash.
- [ ] **Step 2: On the board** (the owner holds the remotes):
  - `ir` with the TV remote, then the air-conditioner remote; record the
    parts, gaps and lengths;
  - learn a button through the API with each;
  - expect `succeeded`, with timings matching `ir`'s.
- [ ] **Step 3: Commit:** "Read IR on the board's RMT".
