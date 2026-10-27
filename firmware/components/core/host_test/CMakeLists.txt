cmake_minimum_required(VERSION 3.22)
# Only core: the other components bring dependencies (the WebSocket client)
# the host tests don't need.
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/..")
set(COMPONENTS main)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(core_host_test)
