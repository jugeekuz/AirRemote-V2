import { clearLine, cursorTo, type Interface } from 'node:readline';

/**
 * readline remembers how many rows the prompt took (`prevRows`) only when it
 * redraws; typing at the end of a line that wraps leaves it stale, and a stale
 * value makes the next redraw erase the wrong rows. Set it from the cursor.
 */
function syncRows(prompt: Interface) {
  (prompt as unknown as { prevRows: number }).prevRows =
    prompt.getCursorPos().rows;
}

/** Prints lines above the prompt, keeping whatever is being typed. */
export function createPrinter({
  prompt,
  input,
  output,
}: {
  prompt: Interface;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream & { isTTY?: boolean };
}) {
  // After readline has handled each key, so its next redraw starts from the
  // right row (moving the cursor back across a wrap redraws the line).
  input.on('keypress', () => syncRows(prompt));

  return {
    print(text: string) {
      if (!output.isTTY) {
        output.write(`${text}\n`);
        return;
      }
      const { line, cursor } = prompt;
      // Empty the typed line through readline (Ctrl+E, Ctrl+U), so it clears
      // every row the line took, then print and type the line back.
      syncRows(prompt);
      prompt.write(null, { ctrl: true, name: 'e' });
      syncRows(prompt);
      prompt.write(null, { ctrl: true, name: 'u' });
      clearLine(output, 0);
      cursorTo(output, 0);
      output.write(`${text}\n`);
      prompt.prompt(true);
      prompt.write(line);
      for (let left = line.length - cursor; left > 0; left -= 1) {
        syncRows(prompt);
        prompt.write(null, { name: 'left' });
      }
    },
  };
}
