#include "runtime/console.hpp"

#include <cstdio>
#include <cstdlib>
#include <string>


#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "linenoise/linenoise.h"

namespace runtime {

namespace {

struct ReaderArgs {
  EventQueue *queue;
  core::Device *device;
  bool line_editing;
};

void post_line(ReaderArgs *args, std::string text) {
  while (!text.empty() && (text.back() == '\n' || text.back() == '\r')) text.pop_back();
  core::Device *device = args->device;
  args->queue->post([device, text] { device->on_line(text); });
}

void read_lines(void *arg) {
  auto *args = static_cast<ReaderArgs *>(arg);
  if (!args->line_editing) {
    // A pipe (the e2e tests): plain lines, no echo, no escape sequences.
    char buffer[512];
    for (;;) {
      if (!fgets(buffer, sizeof(buffer), stdin)) {
        // The other end is gone (the test that started it): nothing more will
        // come, so end, which lets docker --rm clean up.
        if (feof(stdin)) exit(0);
        clearerr(stdin);
        vTaskDelay(pdMS_TO_TICKS(100));
        continue;
      }
      std::string line = buffer;
      if (line.empty() || line.back() != '\n') {
        // Longer than the buffer: drop the rest of it and the line, rather
        // than read its pieces as commands.
        int c;
        while ((c = fgetc(stdin)) != EOF && c != '\n') {
        }
        post_line(args, std::string(300, 'x'));  // core rejects it as too long
        continue;
      }
      post_line(args, line);
    }
  }
  // A terminal that doesn't answer linenoise's probe gets no line editing.
  if (linenoiseProbe() != 0) linenoiseSetDumbMode(1);
  for (;;) {
    char *line = linenoise("");
    if (!line) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    post_line(args, line);
    linenoiseFree(line);
  }
}

}  // namespace

void StdoutConsole::print(std::string_view line) {
  printf("%.*s\n", static_cast<int>(line.size()), line.data());
  fflush(stdout);
}

void start_console_reader(EventQueue &queue, core::Device &device, bool line_editing) {
  static ReaderArgs args;
  args = ReaderArgs{&queue, &device, line_editing};
  xTaskCreate(read_lines, "console", 6144, &args, 5, nullptr);
}

}  // namespace runtime
