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
