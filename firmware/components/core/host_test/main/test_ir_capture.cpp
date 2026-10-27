#include <numeric>
#include <vector>

#include <unity.h>

#include "core/ir_capture.hpp"

using core::IrCapture;
using core::IrPart;
using Kind = IrCapture::Result::Kind;

namespace {

// A part of `count` timings (mark, space, …, mark) of `each` µs each.
std::vector<uint16_t> timings(size_t count, uint16_t each = 560) {
  return std::vector<uint16_t>(count, each);
}

int64_t length_us(const std::vector<uint16_t> &t) {
  return std::accumulate(t.begin(), t.end(), int64_t{0});
}

// The part `t`, starting at `start_us`.
IrPart part_at(const std::vector<uint16_t> &t, int64_t start_us, bool overflowed = false) {
  return IrPart{t, start_us + length_us(t), overflowed};
}

}  // namespace

TEST_CASE("one part is a code of its timings", "[ir]") {
  IrCapture capture;
  const auto nec = timings(67);
  TEST_ASSERT_TRUE(capture.add(part_at(nec, 0)));
  auto result = capture.finish();
  TEST_ASSERT_TRUE(result.kind == Kind::Code);
  TEST_ASSERT_EQUAL(1, (int)result.parts);
  TEST_ASSERT_TRUE(result.timings == nec);
  TEST_ASSERT_TRUE(capture.empty());
}

TEST_CASE("parts under 50 ms apart are one code, with the gap kept as a space", "[ir]") {
  IrCapture capture;
  const auto frame = timings(25, 600);
  int64_t start = 0;
  for (int i = 0; i < 3; i++) {
    TEST_ASSERT_TRUE(capture.add(part_at(frame, start)));
    start += length_us(frame) + 45000;
  }
  auto result = capture.finish();
  TEST_ASSERT_TRUE(result.kind == Kind::Code);
  TEST_ASSERT_EQUAL(3, (int)result.parts);
  std::vector<uint16_t> expected = frame;
  for (int i = 0; i < 2; i++) {
    expected.push_back(45000);
    expected.insert(expected.end(), frame.begin(), frame.end());
  }
  TEST_ASSERT_TRUE(result.timings == expected);
  TEST_ASSERT_EQUAL(2, (int)result.gaps_ms.size());
  TEST_ASSERT_EQUAL_INT64(45, result.gaps_ms[0]);
}

TEST_CASE("an air-conditioner-like code in 3 parts 35 ms apart", "[ir]") {
  IrCapture capture;
  const auto a = timings(39), b = timings(135), c = timings(271);
  TEST_ASSERT_TRUE(capture.add(part_at(a, 0)));
  TEST_ASSERT_TRUE(capture.add(part_at(b, length_us(a) + 35000)));
  TEST_ASSERT_TRUE(capture.add(part_at(c, length_us(a) + 35000 + length_us(b) + 35000)));
  auto result = capture.finish();
  TEST_ASSERT_TRUE(result.kind == Kind::Code);
  TEST_ASSERT_EQUAL(39 + 135 + 271 + 2, (int)result.timings.size());
  TEST_ASSERT_EQUAL_INT64(35, result.gaps_ms[1]);
}

TEST_CASE("a part 50 ms or more after the last one is not joined", "[ir]") {
  IrCapture capture;
  const auto frame = timings(67);
  TEST_ASSERT_TRUE(capture.add(part_at(frame, 0)));
  TEST_ASSERT_FALSE(capture.add(part_at(frame, length_us(frame) + 60000)));
  TEST_ASSERT_FALSE(capture.add(part_at(frame, length_us(frame) + 50000)));
  TEST_ASSERT_EQUAL(1, (int)capture.finish().parts);
}

TEST_CASE("a slightly overlapping part (clock jitter) joins with a zero-free gap", "[ir]") {
  IrCapture capture;
  const auto frame = timings(7);
  TEST_ASSERT_TRUE(capture.add(part_at(frame, 0)));
  TEST_ASSERT_TRUE(capture.add(part_at(frame, length_us(frame) - 20)));
  auto result = capture.finish();
  for (uint16_t t : result.timings) TEST_ASSERT_NOT_EQUAL(0, t);
}

TEST_CASE("under 6 timings is too short", "[ir]") {
  IrCapture capture;
  capture.add(part_at(timings(5), 0));
  TEST_ASSERT_TRUE(capture.finish().kind == Kind::TooShort);
}

TEST_CASE("2047 timings is a code, 2049 is too long", "[ir]") {
  IrCapture fits;
  const auto half = timings(1023);
  fits.add(part_at(half, 0));
  fits.add(part_at(half, length_us(half) + 30000));  // +1 gap entry: 2047
  auto ok = fits.finish();
  TEST_ASSERT_TRUE(ok.kind == Kind::Code);
  TEST_ASSERT_EQUAL(2047, (int)ok.timings.size());

  IrCapture over;
  over.add(part_at(timings(1025), 0));
  over.add(part_at(timings(1023), length_us(timings(1025)) + 30000));  // 2049
  TEST_ASSERT_TRUE(over.finish().kind == Kind::TooLong);
}

TEST_CASE("an overflowed part makes the code too long", "[ir]") {
  IrCapture capture;
  capture.add(part_at(timings(895), 0, true));
  TEST_ASSERT_TRUE(capture.finish().kind == Kind::TooLong);
}

TEST_CASE("a glitch inside a space is merged into it", "[ir]") {
  using V = std::vector<uint16_t>;
  TEST_ASSERT_TRUE(core::remove_ir_glitches(V{9000, 4500, 575, 533, 1, 22, 573, 559, 570}) ==
                   (V{9000, 4500, 575, 556, 573, 559, 570}));
  TEST_ASSERT_TRUE(core::remove_ir_glitches(V{9000, 4500, 600, 431, 1, 101, 597, 1590, 1, 75, 593}) ==
                   (V{9000, 4500, 600, 533, 597, 1666, 593}));
}

TEST_CASE("glitches before the first mark and after the last are dropped", "[ir]") {
  using V = std::vector<uint16_t>;
  TEST_ASSERT_TRUE(core::remove_ir_glitches(V{1, 127, 9041, 4510, 567}) == (V{9041, 4510, 567}));
  TEST_ASSERT_TRUE(core::remove_ir_glitches(V{1, 52, 1, 25, 1, 23, 9047, 4477, 601}) ==
                   (V{9047, 4477, 601}));
  TEST_ASSERT_TRUE(core::remove_ir_glitches(V{9000, 4500, 560, 30, 2}) == (V{9000, 4500, 560}));
  TEST_ASSERT_TRUE(core::remove_ir_glitches(V{1, 2, 3}).empty());
}

TEST_CASE("a clean code is left alone", "[ir]") {
  const std::vector<uint16_t> clean = {9000, 4500, 560, 560, 560, 1690, 560};
  TEST_ASSERT_TRUE(core::remove_ir_glitches(clean) == clean);
}

TEST_CASE("parts are cleaned as they are added", "[ir]") {
  IrCapture capture;
  capture.add(part_at({1, 127, 9000, 4500, 560, 431, 1, 101, 560, 560, 560}, 0));
  auto result = capture.finish();
  TEST_ASSERT_TRUE(result.timings == (std::vector<uint16_t>{9000, 4500, 560, 533, 560, 560, 560}));
}

TEST_CASE("a capture stops growing past the limit and is too long", "[ir]") {
  IrCapture capture;
  int64_t start = 0;
  for (int i = 0; i < 10; i++) {
    const auto part = timings(895);
    capture.add(part_at(part, start));
    start += length_us(part) + 30000;
  }
  TEST_ASSERT_TRUE(capture.size() <= IrCapture::kMaxTimings + 1);
  TEST_ASSERT_TRUE(capture.finish().kind == Kind::TooLong);
}

TEST_CASE("a glitch dropped from a part's end moves its end earlier", "[ir]") {
  IrCapture capture;
  const std::vector<uint16_t> clean = {9000, 4500, 560};
  // The part really ended 30 002 µs before its last (glitch) mark.
  const std::vector<uint16_t> glitchy = {9000, 4500, 560, 30000, 2};
  capture.add(part_at(glitchy, 0));
  TEST_ASSERT_EQUAL_INT64(length_us(clean), capture.ended_at_us());
  capture.add(part_at(clean, length_us(clean) + 40000));
  TEST_ASSERT_EQUAL_INT64(40, capture.finish().gaps_ms[0]);
}

TEST_CASE("remove_ir_glitches reports what it dropped from the end", "[ir]") {
  int64_t dropped = 0;
  auto t = core::remove_ir_glitches({9000, 4500, 560, 30000, 2}, &dropped);
  TEST_ASSERT_EQUAL_INT64(30002, dropped);
  TEST_ASSERT_EQUAL(3, (int)t.size());
}
