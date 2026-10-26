import { describe, expect, it } from 'vitest';
import { COMMAND_HELP, parseCommand } from '../commands';

describe('parseCommand', () => {
  it.each([
    ['/help', { name: 'help' }],
    ['/enroll', { name: 'enroll' }],
    ['/ENROLL', { name: 'enroll' }],
    ['/connect', { name: 'connect' }],
    ['/disconnect', { name: 'disconnect' }],
    ['/status', { name: 'status' }],
    ['/quit', { name: 'quit' }],
    ['  /help  ', { name: 'help' }],
    ['/pongs on', { name: 'pongs', on: true }],
    ['/pongs off', { name: 'pongs', on: false }],
    [
      '/error READ_TIMEOUT No code within 15 s',
      { name: 'error', code: 'READ_TIMEOUT', message: 'No code within 15 s' },
    ],
    ['/error BUSY', { name: 'error', code: 'BUSY' }],
    ['hello', { name: 'unknown' }],
    ['/nope', { name: 'unknown' }],
    ['', { name: 'empty' }],
    ['   ', { name: 'empty' }],
  ])('parses %j', (line, command) => {
    expect(parseCommand(line)).toEqual(command);
  });

  it('sends the rest of the line exactly', () => {
    expect(parseCommand('/send {"type":  "error" }')).toEqual({
      name: 'send',
      text: '{"type":  "error" }',
    });
  });

  it('ignores spaces before the command', () => {
    expect(parseCommand('  /send hi')).toEqual({ name: 'send', text: 'hi' });
  });

  it.each(['/send', '/send   ', '/error', '/pongs', '/pongs maybe'])(
    'answers %j with its usage',
    (line) => {
      const command = parseCommand(line);
      expect(command.name).toBe('usage');
    },
  );
});

describe('COMMAND_HELP', () => {
  it('lists every command', () => {
    expect(COMMAND_HELP.map((entry) => entry.usage.split(' ')[0])).toEqual([
      '/help',
      '/enroll',
      '/connect',
      '/disconnect',
      '/send',
      '/error',
      '/pongs',
      '/status',
      '/quit',
    ]);
  });
});
