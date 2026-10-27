#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_ota_ops.h"

static const char *TAG = "airremote";

extern "C" void app_main(void) {
  ESP_LOGI(TAG, "AirRemote firmware %s", esp_app_get_description()->version);

  // Keeps this image after an OTA update. Move it to after the device has
  // reached the backend once it can.
  ESP_ERROR_CHECK(esp_ota_mark_app_valid_cancel_rollback());
}
