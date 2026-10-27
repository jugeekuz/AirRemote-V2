#pragma once

#include <cstdint>
#include <vector>

namespace core {

// One level for a while: what the IR transmitter (the RMT) takes. A mark is
// the 38 kHz carrier, a space is off.
struct IrSymbol {
  bool mark;
  uint16_t duration;  // µs, at most kMaxIrSymbolUs
};

// The RMT counts each level in 15 bits.
constexpr uint16_t kMaxIrSymbolUs = 32767;

// Protocol timings (mark, space, …) to symbols. Same-level neighbours join, so
// a 0 (the spacer inside gaps over 65535 µs) merges the spaces around it; a
// level longer than the RMT can count is split; a leading or trailing space is
// dropped, since a code starts and ends with a mark.
std::vector<IrSymbol> to_ir_symbols(const std::vector<uint16_t> &timings);

// Symbols back to timings: same-level neighbours join (each entry at most
// 65535). Used by the Linux build to record what it sent.
std::vector<uint16_t> to_timings(const std::vector<IrSymbol> &symbols);

}  // namespace core
