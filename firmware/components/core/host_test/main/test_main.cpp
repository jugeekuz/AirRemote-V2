#include <cstdlib>

#include <unity.h>

extern "C" void app_main(void) {
  UNITY_BEGIN();
  unity_run_all_tests();
  exit(UNITY_END() == 0 ? 0 : 1);
}
