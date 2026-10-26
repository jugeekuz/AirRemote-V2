import pc from 'picocolors';
import { describe, expect, it } from 'vitest';
import { COMMAND_HELP } from '../commands';
import {
  renderBanner,
  renderEvent,
  renderHelp,
  renderStatus,
} from '../terminal';

const colors = pc.createColors(false);
const time = new Date(2026, 9, 26, 12, 4, 9);
const server = 'https://localhost:8443';
const mac = 'AA:BB:CC:DD:EE:01';

describe('renderBanner', () => {
  it('says what it is, its MAC and its server, in a box', () => {
    const banner = renderBanner({ mac, server }, colors);
    expect(banner).toContain('AirRemote · mock device');
    expect(banner).toContain(mac);
    expect(banner).toContain(server);
    const lines = banner.split('\n');
    expect(lines[0]?.trim().startsWith('╭')).toBe(true);
    expect(lines.at(-1)?.trim().startsWith('╰')).toBe(true);
    // Every line of the box is the same width.
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });
});

describe('renderEvent', () => {
  it('marks sent lines with →', async () => {
    expect(
      await renderEvent(
        { kind: 'sent', text: 'POST /pairing-code' },
        time,
        colors,
      ),
    ).toBe('12:04:09  →  POST /pairing-code');
  });

  it('marks received lines with ←', async () => {
    expect(
      await renderEvent(
        { kind: 'received', text: '403 Forbidden' },
        time,
        colors,
      ),
    ).toBe('12:04:09  ←  403 Forbidden');
  });

  it('marks the device’s own status with ·', async () => {
    expect(
      await renderEvent(
        { kind: 'status', text: 'connected', tone: 'success' },
        time,
        colors,
      ),
    ).toBe('12:04:09  ·  connected');
  });

  it('pretty-prints long JSON under the text', async () => {
    const body = {
      pairingCode: '7K4MQ9TX',
      expiresAt: '2026-10-26T12:19:09.000Z',
      note: 'x'.repeat(40),
    };
    const rendered = await renderEvent(
      { kind: 'received', text: `201 Created ${JSON.stringify(body)}` },
      time,
      colors,
    );
    const lines = rendered.split('\n');
    expect(lines[0]).toBe('12:04:09  ←  201 Created {');
    // The text column starts after "12:04:09  ←  " (13 characters).
    expect(lines).toContain(`${' '.repeat(13)}  "pairingCode": "7K4MQ9TX",`);
  });

  it('keeps short JSON on one line', async () => {
    const text = '{"type":"error","code":"INVALID_JSON","message":"x"}';
    expect(await renderEvent({ kind: 'received', text }, time, colors)).toBe(
      `12:04:09  ←  ${text}`,
    );
  });

  it('shows a pairing code as a QR code with the grouped code and time left', async () => {
    const rendered = await renderEvent(
      {
        kind: 'pairing',
        code: '7K4MQ9TX',
        expiresAt: time.getTime() + 15 * 60_000,
        uri: 'airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX',
      },
      time,
      colors,
    );
    expect(rendered).toContain('code 7K4M-Q9TX · expires in 15:00');
    const lines = rendered.split('\n');
    expect(lines.length).toBeGreaterThan(10);
    // No line is blank once its colour codes are removed.
    for (const line of lines) {
      // eslint-disable-next-line no-control-regex
      expect(line.replace(/\x1b\[[0-9;]*m/g, '').trim()).not.toBe('');
    }
  });
});

describe('renderHelp', () => {
  it('lists every command', () => {
    const help = renderHelp(colors);
    for (const { usage, description } of COMMAND_HELP) {
      expect(help).toContain(usage);
      expect(help).toContain(description);
    }
  });
});

describe('renderStatus', () => {
  it('shows the state, pongs and the pending code with its time left', () => {
    const status = renderStatus(
      {
        mac,
        state: 'waiting-for-enrollment',
        pongs: false,
        pendingCode: { code: '7K4MQ9TX', expiresAt: time.getTime() + 61_000 },
        pendingRead: null,
      },
      server,
      time.getTime(),
      colors,
    );
    expect(status).toContain(mac);
    expect(status).toContain(server);
    expect(status).toContain('waiting-for-enrollment');
    expect(status).toContain('off');
    expect(status).toContain('7K4M-Q9TX (1:01 left)');
  });

  it('says when no code is pending', () => {
    const status = renderStatus(
      {
        mac,
        state: 'connected',
        pongs: true,
        pendingCode: null,
        pendingRead: null,
      },
      server,
      time.getTime(),
      colors,
    );
    expect(status).toContain('connected');
    expect(status).toContain('none');
    expect(status).toContain('no read in progress');
  });

  it('shows a pending read with its time left', () => {
    const status = renderStatus(
      {
        mac,
        state: 'connected',
        pongs: true,
        pendingCode: null,
        pendingRead: {
          commandId: '3f6c1a52-8d1e-4a57-9c52-0a1b2c3d4e5f',
          expiresAt: time.getTime() + 12_000,
        },
      },
      server,
      time.getTime(),
      colors,
    );
    expect(status).toContain('listening (0:12 left)');
  });
});
