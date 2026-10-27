#include <vector>

#include <unity.h>

#include "core/ir_symbols.hpp"

using core::IrSymbol;

namespace {

bool same(const std::vector<IrSymbol> &a, const std::vector<IrSymbol> &b) {
  if (a.size() != b.size()) return false;
  for (size_t i = 0; i < a.size(); i++) {
    if (a[i].mark != b[i].mark || a[i].duration != b[i].duration) return false;
  }
  return true;
}

}  // namespace

TEST_CASE("a plain code alternates marks and spaces", "[symbols]") {
  TEST_ASSERT_TRUE(same(core::to_ir_symbols({9000, 4500, 560}),
                        {{true, 9000}, {false, 4500}, {true, 560}}));
}

TEST_CASE("a 0 spacer joins the spaces around it, and long ones are split", "[symbols]") {
  // 65535 + 4465 = 70000 µs of space, at most 32767 per symbol.
  TEST_ASSERT_TRUE(same(core::to_ir_symbols({560, 65535, 0, 4465, 560}),
                        {{true, 560},
                         {false, 32767},
                         {false, 32767},
                         {false, 4466},
                         {true, 560}}));
}

TEST_CASE("a long mark is split too", "[symbols]") {
  TEST_ASSERT_TRUE(same(core::to_ir_symbols({40000}), {{true, 32767}, {true, 7233}}));
}

TEST_CASE("a trailing space is dropped, and an empty code is nothing", "[symbols]") {
  TEST_ASSERT_TRUE(same(core::to_ir_symbols({560, 560, 560, 30000}),
                        {{true, 560}, {false, 560}, {true, 560}}));
  TEST_ASSERT_TRUE(core::to_ir_symbols({}).empty());
}

TEST_CASE("symbols back to timings give the code again", "[symbols]") {
  const std::vector<uint16_t> code = {9000, 4500, 560, 1690, 560};
  TEST_ASSERT_TRUE(core::to_timings(core::to_ir_symbols(code)) == code);
  // Split pieces join again (clamped to 65535 per entry).
  TEST_ASSERT_TRUE(core::to_timings(core::to_ir_symbols({560, 40000, 560})) ==
                   (std::vector<uint16_t>{560, 40000, 560}));
}
