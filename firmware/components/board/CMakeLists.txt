# The ESP32's own drivers: Wi-Fi, the settings in NVS, the identity reader and
# the IR receiver.
idf_component_register(SRCS "src/wifi.cpp" "src/settings.cpp" "src/identity.cpp" "src/ir_receiver.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES core runtime esp_wifi esp_netif esp_event nvs_flash esp_driver_rmt esp_driver_gpio esp_timer)
