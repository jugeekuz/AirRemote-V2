import type { Colors } from 'picocolors/types';
import QRCode from 'qrcode';
import { COMMAND_HELP } from './commands';
import type { DeviceEvent, DeviceStatus } from './device';
import { formatRemaining, groupPairingCode } from './format';

/** Where a line's text starts: after `12:04:09  →  `. */
const TEXT_COLUMN = ' '.repeat(13);
/** JSON longer than this is pretty-printed over several lines. */
const LONG_LINE = 100;

// eslint-disable-next-line no-control-regex
const stripColours = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

export function renderBanner(
  { mac, server }: { mac: string; server: string },
  colors: Colors,
): string {
  const rows: [plain: string, styled: string][] = [
    [
      '   ◉  AirRemote · mock device',
      `   ${colors.green('◉')}  ${colors.bold('AirRemote')} · mock device`,
    ],
    [`      MAC     ${mac}`, `      ${colors.dim('MAC')}     ${mac}`],
    [`      server  ${server}`, `      ${colors.dim('server')}  ${server}`],
  ];
  const width = Math.max(42, ...rows.map(([plain]) => plain.length + 5));
  const edge = (left: string, right: string) =>
    colors.cyan(`  ${left}${'─'.repeat(width)}${right}`);
  return [
    edge('╭', '╮'),
    ...rows.map(
      ([plain, styled]) =>
        `${colors.cyan('  │')}${styled}${' '.repeat(width - plain.length)}${colors.cyan('│')}`,
    ),
    edge('╰', '╯'),
  ].join('\n');
}

const clock = (time: Date) =>
  [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');

/** Pretty-prints a long line's JSON part over several lines, aligned under the text. */
function layout(text: string): string {
  if (text.length <= LONG_LINE) return text;
  const start = text.search(/[{[]/);
  if (start === -1) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start));
  } catch {
    return text;
  }
  const [first, ...rest] = JSON.stringify(parsed, null, 2).split('\n');
  return [
    text.slice(0, start) + first,
    ...rest.map((line) => TEXT_COLUMN + line),
  ].join('\n');
}

export async function renderEvent(
  event: DeviceEvent,
  time: Date,
  colors: Colors,
): Promise<string> {
  const prefix = (marker: string) => `${colors.dim(clock(time))}  ${marker}  `;

  switch (event.kind) {
    case 'sent': {
      const line = prefix(colors.cyan('→')) + layout(event.text);
      return event.dim ? colors.dim(line) : line;
    }
    case 'received': {
      const line = prefix(colors.magenta('←')) + layout(event.text);
      return event.dim ? colors.dim(line) : line;
    }
    case 'status': {
      const tone = {
        info: (text: string) => text,
        success: colors.green,
        error: colors.red,
        dim: colors.dim,
      }[event.tone];
      return prefix(colors.dim('·')) + tone(event.text);
    }
    case 'pairing': {
      const qr = await QRCode.toString(event.uri, {
        type: 'terminal',
        small: true,
      });
      const left = formatRemaining(event.expiresAt - time.getTime());
      return [
        ...qr
          .split('\n')
          // qrcode ends with a line that holds only colour codes.
          .filter((line) => stripColours(line).trim() !== '')
          .map((line) => TEXT_COLUMN + line),
        `${TEXT_COLUMN}code ${colors.bold(groupPairingCode(event.code))} · expires in ${left}`,
      ].join('\n');
    }
  }
}

export function renderHelp(colors: Colors): string {
  const width = Math.max(...COMMAND_HELP.map(({ usage }) => usage.length));
  return [
    colors.bold('Commands'),
    ...COMMAND_HELP.map(
      ({ usage, description }) =>
        `  ${colors.cyan(usage.padEnd(width))}  ${description}`,
    ),
  ].join('\n');
}

export function renderStatus(
  status: DeviceStatus,
  server: string,
  now: number,
  colors: Colors,
): string {
  const code = status.pendingCode
    ? `${groupPairingCode(status.pendingCode.code)} (${formatRemaining(status.pendingCode.expiresAt - now)} left)`
    : 'none';
  const rows: [string, string][] = [
    ['MAC', status.mac],
    ['server', server],
    ['state', status.state],
    ['pongs', status.pongs ? 'on' : 'off'],
    ['code', code],
  ];
  return rows
    .map(([label, value]) => `  ${colors.dim(label.padEnd(8))} ${value}`)
    .join('\n');
}
