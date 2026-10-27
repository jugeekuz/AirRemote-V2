# What both apps run Device on: one task draining an event queue, FreeRTOS
# timers and a console line reader. Builds for esp32 and linux.
idf_component_register(SRCS "src/event_queue.cpp" "src/timers.cpp" "src/console.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES core freertos console)
