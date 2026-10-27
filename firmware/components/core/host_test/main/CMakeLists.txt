idf_component_register(SRCS "test_main.cpp" "test_protocol.cpp" "test_commands.cpp"
                            "test_text.cpp" "test_device.cpp" "test_ir_capture.cpp" "test_ir_symbols.cpp"
                       REQUIRES core unity
                       WHOLE_ARCHIVE)
