# The CA that signed the device listener's certificate, from the repository's
# certs/ (scripts/dev-certs.sh); idf.sh mounts only that file at /certs.
set(server_ca "/certs/device-ca.crt")
if(NOT EXISTS "${server_ca}")
  message(FATAL_ERROR "No ${server_ca}: run scripts/dev-certs.sh at the repository root, "
                      "then build through firmware/scripts/idf.sh.")
endif()

idf_component_register(SRCS "main.cpp"
                       REQUIRES app_update esp_app_format log core runtime connection board
                                nvs_flash esp_netif esp_event esp_driver_uart esp_hw_support
                       EMBED_TXTFILES "${server_ca}")

# The device listener's address, e.g. https://192.168.1.10:8443, from a
# git-ignored file, so an edit applies on the next build. CMake only notices a
# file that existed when it configured; while it doesn't, watch the folder it
# will appear in.
set(url_file "${CMAKE_CURRENT_LIST_DIR}/../backend-url.txt")
set(backend_url "")
if(EXISTS "${url_file}")
  file(READ "${url_file}" backend_url)
  string(STRIP "${backend_url}" backend_url)
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${url_file}")
else()
  message(WARNING "No firmware/backend-url.txt: the board will not connect.")
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/..")
endif()
target_compile_definitions(${COMPONENT_LIB} PRIVATE AIRREMOTE_BACKEND_URL="${backend_url}")
