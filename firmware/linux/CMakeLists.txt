# The firmware as a Linux program, for the e2e tests in firmware/e2e: core,
# runtime and connection as on the board, with stand-ins for Wi-Fi, settings
# and the identity partition.
cmake_minimum_required(VERSION 3.22)
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../components")
# Only what main needs: the linux target lacks the hardware components.
set(COMPONENTS main)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(airremote_linux)

# esp_websocket_client stores portMAX_DELAY in an int. On 64-bit Linux that
# warns; the value still means "wait forever" when it is passed back.
idf_component_get_property(ws_lib espressif__esp_websocket_client COMPONENT_LIB)
target_compile_options(${ws_lib} PRIVATE -Wno-error=overflow)
