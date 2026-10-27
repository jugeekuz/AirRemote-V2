#include "core/ir_symbols.hpp"

#include <algorithm>

namespace core {

std::vector<IrSymbol> to_ir_symbols(const std::vector<uint16_t> &timings) {
  // Each level's total length, alternating from a mark.
  std::vector<std::pair<bool, uint32_t>> levels;
  for (size_t i = 0; i < timings.size(); i++) {
    // A 0 (the spacer) is no level at all: the spaces either side of it meet.
    if (timings[i] == 0) continue;
    const bool mark = i % 2 == 0;
    if (!levels.empty() && levels.back().first == mark) {
      levels.back().second += timings[i];
    } else {
      levels.emplace_back(mark, timings[i]);
    }
  }
  while (!levels.empty() && !levels.front().first) levels.erase(levels.begin());
  while (!levels.empty() && !levels.back().first) levels.pop_back();

  std::vector<IrSymbol> symbols;
  for (auto [mark, total] : levels) {
    while (total > 0) {
      const uint32_t piece = std::min<uint32_t>(total, kMaxIrSymbolUs);
      symbols.push_back({mark, static_cast<uint16_t>(piece)});
      total -= piece;
    }
  }
  return symbols;
}

std::vector<uint16_t> to_timings(const std::vector<IrSymbol> &symbols) {
  std::vector<uint16_t> timings;
  bool last_mark = false;
  for (const IrSymbol &symbol : symbols) {
    if (!timings.empty() && symbol.mark == last_mark) {
      timings.back() = static_cast<uint16_t>(
          std::min<uint32_t>(uint32_t{timings.back()} + symbol.duration, 65535));
    } else {
      timings.push_back(symbol.duration);
      last_mark = symbol.mark;
    }
  }
  return timings;
}

}  // namespace core
