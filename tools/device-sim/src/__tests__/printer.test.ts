import { createInterface, type Interface } from 'node:readline';
import { PassThrough, Writable } from 'node:stream';
import xterm from '@xterm/headless';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrinter } from '../printer';

const COLUMNS = 40;
let prompt: Interface | undefined;

afterEach(() => {
  prompt?.close();
});

/** A readline prompt drawing on an emulated terminal, so the test sees the real screen. */
function terminalWithPrompt() {
  const terminal = new xterm.Terminal({
    cols: COLUMNS,
    rows: 40,
    allowProposedApi: true,
  });
  const output = Object.assign(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        terminal.write(chunk.toString('utf8'));
        done();
      },
    }),
    { isTTY: true, columns: COLUMNS, rows: 40 },
  );
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode: () => input,
  });
  prompt = createInterface({ input, output, terminal: true, prompt: '› ' });
  const { print } = createPrinter({ prompt, input, output });

  async function type(text: string) {
    input.write(text);
    await new Promise((resolve) => setImmediate(resolve));
  }

  /** The screen's lines, with soft-wrapped rows joined back together. */
  async function screen(): Promise<string[]> {
    await new Promise<void>((resolve) => terminal.write('', resolve));
    const buffer = terminal.buffer.active;
    const lines: string[] = [];
    for (let row = 0; row < buffer.length; row += 1) {
      const line = buffer.getLine(row);
      if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length > 0) {
        lines[lines.length - 1] += text;
      } else {
        lines.push(text);
      }
    }
    while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop();
    return lines;
  }

  return { prompt, print, type, screen };
}

const typed = '/send {"type":"error","message":"abcdefghijklmnop"';

describe('createPrinter', () => {
  it('keeps log lines that arrive while a short line is typed', async () => {
    const { prompt, print, type, screen } = terminalWithPrompt();
    prompt.prompt();
    await type('/sta');
    print('LOG ONE');
    print('LOG TWO');
    expect(await screen()).toEqual(['LOG ONE', 'LOG TWO', '› /sta']);
  });

  it('keeps log lines that arrive while a line longer than the terminal is typed', async () => {
    const { prompt, print, type, screen } = terminalWithPrompt();
    prompt.prompt();
    await type(typed);
    print('LOG ONE');
    print('LOG TWO');
    expect(await screen()).toEqual(['LOG ONE', 'LOG TWO', `› ${typed}`]);
  });

  it('keeps a wrapped line and its cursor when the cursor is on its first row', async () => {
    const { prompt, print, type, screen } = terminalWithPrompt();
    prompt.prompt();
    await type(typed);
    await type('\x1b[D'.repeat(20));
    print('LOG ONE');
    print('LOG TWO');
    await type('X');
    const edited = `${typed.slice(0, -20)}X${typed.slice(-20)}`;
    expect(prompt.line).toBe(edited);
    expect(await screen()).toEqual(['LOG ONE', 'LOG TWO', `› ${edited}`]);
  });

  it('keeps readline’s own redraws right when the cursor crosses a wrap', async () => {
    const { prompt, type, screen } = terminalWithPrompt();
    prompt.prompt();
    await type(typed);
    await type('\x1b[D'.repeat(20));
    expect(await screen()).toEqual([`› ${typed}`]);
  });

  it('keeps the cursor where it was in the typed line', async () => {
    const { prompt, print, type } = terminalWithPrompt();
    prompt.prompt();
    await type('abc');
    await type('\x1b[D\x1b[D');
    print('LOG');
    await type('X');
    expect(prompt.line).toBe('aXbc');
  });
});
