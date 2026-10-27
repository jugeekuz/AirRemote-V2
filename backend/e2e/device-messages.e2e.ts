import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeCode,
  nextMessage,
  useDeviceServer,
} from './support/device-server';

const devices = useDeviceServer();

beforeEach(async () => {
  await devices.allowDevice('AA:BB:CC:DD:EE:01');
});

describe('device messages', () => {
  it('answers a binary frame with UNSUPPORTED_FRAME', async () => {
    const socket = await devices.connect('allowed');
    const reply = nextMessage(socket);
    socket.send(Buffer.from('{"type":"error","message":"x"}'), {
      binary: true,
    });
    expect(await reply).toEqual({
      type: 'error',
      code: 'UNSUPPORTED_FRAME',
      message: 'Binary frames are not supported',
    });
  });

  it('answers invalid JSON with INVALID_JSON', async () => {
    const socket = await devices.connect('allowed');
    const reply = nextMessage(socket);
    socket.send('{nope');
    expect(await reply).toEqual({
      type: 'error',
      code: 'INVALID_JSON',
      message: 'Message is not valid JSON',
    });
  });

  it('answers a message that fails the schema with INVALID_MESSAGE', async () => {
    const socket = await devices.connect('allowed');
    const reply = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'notAMessage' }));
    expect(await reply).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });
  });

  it('accepts a device error report without replying', async () => {
    const socket = await devices.connect('allowed');
    const reply = nextMessage(socket);
    socket.send(
      JSON.stringify({
        type: 'error',
        code: 'READ_TIMEOUT',
        message: 'IR timed out',
      }),
    );
    socket.send('{nope');
    expect(await reply).toMatchObject({ code: 'INVALID_JSON' });
  });

  it('accepts the longest possible read result, which fits one frame', async () => {
    const socket = await devices.connect('allowed');
    const reply = nextMessage(socket);
    const longest = JSON.stringify({
      type: 'readIrResult',
      commandId: '6f1c2a52-3c1e-4a8e-9a43-0d5f1f6f2b11',
      timingsUs: Array(2048).fill(65_535),
    });
    expect(Buffer.byteLength(longest)).toBeLessThan(16 * 1024);
    socket.send(longest);
    socket.send('{nope');
    // The first reply answers '{nope': the result was accepted silently.
    expect(await reply).toMatchObject({ code: 'INVALID_JSON' });
  });

  it('closes with 1008 after 5 bad frames in a row', async () => {
    const socket = await devices.connect('allowed');
    const closed = closeCode(socket);
    for (let i = 0; i < 5; i += 1) socket.send('{nope');
    expect(await closed).toBe(1008);
  });

  it('closes with 1009 when a frame is over 16 KiB', async () => {
    const socket = await devices.connect('allowed');
    const closed = closeCode(socket);
    socket.send('x'.repeat(16 * 1024 + 1));
    expect(await closed).toBe(1009);
  });

  it('accepts new connections after closing an oversized frame', async () => {
    const socket = await devices.connect('allowed');
    const closed = closeCode(socket);
    socket.send('x'.repeat(16 * 1024 + 1));
    await closed;

    const again = await devices.connect('allowed');
    const reply = nextMessage(again);
    again.send('{nope');
    expect(await reply).toMatchObject({ code: 'INVALID_JSON' });
  });
});
