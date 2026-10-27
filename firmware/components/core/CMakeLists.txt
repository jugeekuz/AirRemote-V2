# Platform-free: no hardware-related component in REQUIRES. ESP-IDF still
# exposes its common components (FreeRTOS, log, soc, hal, ...) to every
# component, so scripts/test.sh also rejects their headers here.
idf_component_register(SRCS "src/placeholder.cpp"
                       INCLUDE_DIRS "include")
