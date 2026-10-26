import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import pc from 'picocolors';
import { parseCliArgs } from './args';
import { parseCommand } from './commands';
import { createDevice, type DeviceEvent } from './device';
import { loadIdentity } from './identity';
import { createNodeTransport, systemClock } from './node-transport';
import { createPrinter } from './printer';
import {
  renderBanner,
  renderEvent,
  renderHelp,
  renderStatus,
} from './terminal';

const colors = pc.createColors(
  Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
);

function exitWith(message: string): never {
  console.error(colors.red(message));
  process.exit(1);
}

// `pnpm device-sim -- --mac …` may pass the separator through.
const argv = process.argv
  .slice(2)
  .filter((arg, index) => index > 0 || arg !== '--');
const parsed = parseCliArgs(argv);
if (!parsed.ok) exitWith(parsed.message);
const { mac, server } = parsed.options;
// pnpm runs this from the package folder; a relative --certs means where you typed it.
const certsDir = resolve(
  process.env.INIT_CWD ?? process.cwd(),
  parsed.options.certsDir,
);

const loaded = await loadIdentity(mac, certsDir);
if (!loaded.ok) exitWith(loaded.message);

console.log(`\n${renderBanner({ mac, server }, colors)}\n`);
console.log(colors.dim('  Type /help for commands.\n'));

const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: colors.cyan('› '),
});

const { print } = createPrinter({
  prompt,
  input: process.stdin,
  output: process.stdout,
});

// Events render in order even though a QR code takes a moment to draw.
let rendering = Promise.resolve();
function onEvent(event: DeviceEvent) {
  const time = new Date();
  rendering = rendering.then(async () =>
    print(await renderEvent(event, time, colors)),
  );
}

const device = createDevice({
  mac,
  transport: createNodeTransport({ server, identity: loaded.identity }),
  clock: systemClock,
  onEvent,
});

let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  device.stop();
  await rendering;
  process.stdout.write('\n');
  process.exit(0);
}

prompt.on('line', (line) => {
  const command = parseCommand(line);
  switch (command.name) {
    case 'help':
      print(renderHelp(colors));
      break;
    case 'enroll':
      void device.enroll();
      break;
    case 'connect':
      device.connect();
      break;
    case 'disconnect':
      device.disconnect();
      break;
    case 'send':
      device.send(command.text);
      break;
    case 'error':
      device.sendError(command.code, command.message);
      break;
    case 'press':
      device.press(command.timings);
      break;
    case 'pongs':
      device.setPongs(command.on);
      break;
    case 'status':
      print(renderStatus(device.status(), server, Date.now(), colors));
      break;
    case 'quit':
      void quit();
      return;
    case 'usage':
      print(colors.yellow(`usage: ${command.usage}`));
      break;
    case 'unknown':
      print(colors.yellow('unknown command, type /help'));
      break;
    case 'empty':
      break;
  }
  prompt.prompt();
});
prompt.on('SIGINT', () => void quit());
prompt.on('close', () => void quit());

prompt.prompt();
device.start();
