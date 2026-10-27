#include <unity.h>

#include "core/placeholder.hpp"

TEST_CASE("placeholder_sum adds two numbers", "[core]") {
  TEST_ASSERT_EQUAL(5, core::placeholder_sum(2, 3));
}
