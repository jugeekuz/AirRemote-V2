# The link to the backend's device listener, over mTLS: the WebSocket and
# POST /pairing-code. Builds for esp32 and linux.
idf_component_register(SRCS "src/websocket_link.cpp" "src/pairing_api.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES core runtime esp_http_client esp-tls
                                espressif__esp_websocket_client)
