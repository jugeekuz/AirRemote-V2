#include "core/ir_capture.hpp"

#include <algorithm>
#include <numeric>

namespace core {

std::vector<uint16_t> remove_ir_glitches(std::vector<uint16_t> t) {
  for (;;) {
    if (t.empty()) return t;
    const auto shortest = std::min_element(t.begin(), t.end());
    if (*shortest >= IrCapture::kGlitchUs) return t;
    const size_t i = static_cast<size_t>(shortest - t.begin());
    if (i == 0) {
      t.erase(t.begin(), t.begin() + std::min<size_t>(2, t.size()));
    } else if (i == t.size() - 1) {
      t.erase(t.end() - std::min<size_t>(2, t.size()), t.end());
    } else {
      const uint32_t merged = uint32_t{t[i - 1]} + t[i] + t[i + 1];
      t[i - 1] = static_cast<uint16_t>(std::min<uint32_t>(merged, 65535));
      t.erase(t.begin() + i, t.begin() + i + 2);
    }
  }
}

bool IrCapture::add(const IrPart &raw) {
  // The part keeps its end time: the silence after it is unchanged.
  const IrPart part{remove_ir_glitches(raw.timings), raw.ended_at_us, raw.overflowed};
  if (part.timings.empty()) return true;
  const int64_t duration =
      std::accumulate(part.timings.begin(), part.timings.end(), int64_t{0});
  if (parts_ > 0) {
    // At least 1 µs: the clock can make a part seem to start a hair early,
    // and a 0 would read as the protocol's long-gap spacer.
    const int64_t gap = std::max<int64_t>(part.ended_at_us - duration - ended_at_us_, 1);
    if (gap >= kEndSilenceUs) return false;
    timings_.push_back(static_cast<uint16_t>(std::min<int64_t>(gap, 65535)));
    gaps_ms_.push_back((gap + 500) / 1000);
  }
  timings_.insert(timings_.end(), part.timings.begin(), part.timings.end());
  overflowed_ = overflowed_ || part.overflowed;
  ended_at_us_ = part.ended_at_us;
  parts_++;
  return true;
}

IrCapture::Result IrCapture::finish() {
  Result result;
  result.parts = parts_;
  result.gaps_ms = std::move(gaps_ms_);
  if (overflowed_ || timings_.size() > kMaxTimings) {
    result.kind = Result::Kind::TooLong;
  } else if (timings_.size() < kMinTimings) {
    result.kind = Result::Kind::TooShort;
  } else {
    result.kind = Result::Kind::Code;
    result.timings = std::move(timings_);
  }
  *this = IrCapture();
  return result;
}

}  // namespace core
