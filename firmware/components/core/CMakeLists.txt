# Platform-free: nothing hardware-related in REQUIRES. ESP-IDF still exposes
# its common components (FreeRTOS, log, soc, hal, ...) to every component, so
# scripts/test.sh also rejects their headers here. cJSON is plain C.
idf_component_register(SRCS "src/protocol.cpp" "src/commands.cpp" "src/text.cpp" "src/device.cpp" "src/ir_capture.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES espressif__cjson)
