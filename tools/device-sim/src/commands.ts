export type Command =
  | { name: 'help' }
  | { name: 'enroll' }
  | { name: 'connect' }
  | { name: 'disconnect' }
  | { name: 'status' }
  | { name: 'quit' }
  | { name: 'send'; text: string }
  | { name: 'error'; message: string }
  | { name: 'pongs'; on: boolean }
  | { name: 'usage'; usage: string }
  | { name: 'unknown' }
  | { name: 'empty' };

export const COMMAND_HELP: readonly { usage: string; description: string }[] = [
  { usage: '/help', description: 'list the commands' },
  {
    usage: '/enroll',
    description: 'get a pairing code, show it, and wait to be enrolled',
  },
  { usage: '/connect', description: 'open the WebSocket now' },
  {
    usage: '/disconnect',
    description: 'close the WebSocket and stop reconnecting',
  },
  { usage: '/send <text>', description: 'send <text> as is, unvalidated' },
  { usage: '/error <message>', description: 'send a valid error message' },
  { usage: '/pongs on|off', description: 'answer the server’s pings or not' },
  { usage: '/status', description: 'show the device’s state' },
  { usage: '/quit', description: 'disconnect and exit (also Ctrl+C)' },
];

const usage = (name: string): Command => ({
  name: 'usage',
  usage: COMMAND_HELP.find((entry) => entry.usage.startsWith(`/${name}`))!
    .usage,
});

export function parseCommand(line: string): Command {
  const input = line.trim();
  if (input === '') return { name: 'empty' };
  if (!input.startsWith('/')) return { name: 'unknown' };

  const space = input.indexOf(' ');
  const name = (
    space === -1 ? input.slice(1) : input.slice(1, space)
  ).toLowerCase();
  // `/send` keeps everything after the first space, untouched.
  const rest = space === -1 ? '' : input.slice(space + 1);

  switch (name) {
    case 'help':
    case 'enroll':
    case 'connect':
    case 'disconnect':
    case 'status':
    case 'quit':
      return { name };
    case 'send':
      return rest.trim() === '' ? usage('send') : { name: 'send', text: rest };
    case 'error':
      return rest.trim() === ''
        ? usage('error')
        : { name: 'error', message: rest.trim() };
    case 'pongs':
      if (rest.trim() === 'on') return { name: 'pongs', on: true };
      if (rest.trim() === 'off') return { name: 'pongs', on: false };
      return usage('pongs');
    default:
      return { name: 'unknown' };
  }
}
