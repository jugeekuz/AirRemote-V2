idf_component_register(SRCS "main.cpp" "file_ir_receiver.cpp" "file_ir_sender.cpp"
                       REQUIRES core runtime connection mbedtls esp_event esp_timer freertos)

# ESP-IDF reads version.txt only from the project's own folder.
file(READ "${CMAKE_CURRENT_LIST_DIR}/../../version.txt" firmware_version)
string(STRIP "${firmware_version}" firmware_version)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
             "${CMAKE_CURRENT_LIST_DIR}/../../version.txt")
target_compile_definitions(${COMPONENT_LIB} PRIVATE
                           AIRREMOTE_FIRMWARE_VERSION="${firmware_version}")
