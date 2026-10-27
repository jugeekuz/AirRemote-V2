#include "core/ir_capture.hpp"

#include <algorithm>
#include <numeric>

namespace core {

bool IrCapture::add(const IrPart &part) {
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
