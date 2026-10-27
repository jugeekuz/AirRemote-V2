# The ESP32's own drivers: Wi-Fi, the settings in NVS and the identity reader.
idf_component_register(SRCS "src/wifi.cpp" "src/settings.cpp" "src/identity.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES core runtime esp_wifi esp_netif esp_event nvs_flash)
