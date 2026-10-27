#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace core {

// One stretch of IR the receiver captured: mark, space, …, mark (µs), ending
// at `ended_at_us` on the device's monotonic clock. `overflowed`: the
// receiver's buffer filled, so the part is cut short.
struct IrPart {
  std::vector<uint16_t> timings;
  int64_t ended_at_us = 0;
  bool overflowed = false;
};

// `dropped_tail_us`: how much was dropped from the end, which moves the end
// of the part earlier.
// Removes pulses too short to be IR (the TSOP needs ~10 carrier cycles, about
// 250 µs, to respond): each, shortest first, is merged with its neighbours, so a
// blip inside a space becomes part of that space; at either end it is dropped
// with its neighbour. Stray light or a nearby emitter causes them.
std::vector<uint16_t> remove_ir_glitches(std::vector<uint16_t> timings,
                                         int64_t *dropped_tail_us = nullptr);

// Joins parts into one code. Remotes (air conditioners especially) send a
// code in parts with short silences between them; the silence is kept as the
// space between the parts, so a replay reproduces it. A code ends after
// kEndSilenceUs of silence.
class IrCapture {
 public:
  static constexpr int64_t kEndSilenceUs = 50000;
  static constexpr size_t kMinTimings = 6;     // shorter: noise or a lone repeat frame
  static constexpr size_t kMaxTimings = 2048;  // the protocol's limit
  static constexpr uint16_t kGlitchUs = 100;
  // How long after a part ends the receiver reports it (the RMT's idle).
  static constexpr int64_t kReportDelayUs = 30000;
  // How long past the deadline steady IR may keep a read open.
  static constexpr int64_t kOverrunUs = 2000000;

  struct Result {
    enum class Kind { Code, TooShort, TooLong };
    Kind kind = Kind::TooShort;
    std::vector<uint16_t> timings;
    std::vector<int64_t> gaps_ms;  // between consecutive parts
    size_t parts = 0;
  };

  // False when `part` starts kEndSilenceUs or more after the code so far: it
  // belongs to the next code, and nothing is added. Glitches are removed first.
  bool add(const IrPart &part);
  bool empty() const { return parts_ == 0; }
  size_t size() const { return timings_.size(); }
  int64_t ended_at_us() const { return ended_at_us_; }
  // The code so far; the capture is empty afterwards.
  Result finish();

 private:
  std::vector<uint16_t> timings_;
  std::vector<int64_t> gaps_ms_;
  size_t parts_ = 0;
  bool overflowed_ = false;
  int64_t ended_at_us_ = 0;
};

}  // namespace core
