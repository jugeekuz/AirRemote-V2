import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDevice,
  type Clock,
  type DeviceEvent,
  type DeviceSocket,
  type HttpResult,
  type OpenResult,
  type SocketEvents,
  type Transport,
} from '../device';

const mac = 'AA:BB:CC:DD:EE:01';
const start = Date.parse('2026-10-26T12:00:00.000Z');

/** Timers that run only when the test advances time. */
function fakeClock() {
  let now = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock & {
    advance(ms: number): Promise<void>;
    pending(): number;
  } = {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        now = timer.at;
        timer.fn();
        await flush();
      }
      now = until;
    },
    pending: () => timers.size,
  };
  return clock;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

type FakeSocket = DeviceSocket & {
  events: SocketEvents;
  sent: string[];
  pongs: number;
  closed: [number, string][];
};

/** 'accept' opens a socket; a number refuses the upgrade; a string is a network error. */
type Outcome = 'accept' | number | string;

function fakeTransport() {
  const sockets: FakeSocket[] = [];
  const transport: Transport & {
    nextOpen: () => Outcome;
    pairing: () => Promise<HttpResult>;
    sockets: FakeSocket[];
    opens: number;
  } = {
    nextOpen: () => 'accept',
    pairing: async () => ({
      status: 201,
      body: {
        pairingCode: '7K4MQ9TX',
        expiresAt: new Date(start + 15 * 60_000).toISOString(),
      },
    }),
    sockets,
    opens: 0,
    postPairingCode() {
      return transport.pairing();
    },
    async openSocket(events): Promise<OpenResult> {
      transport.opens += 1;
      const outcome = transport.nextOpen();
      if (typeof outcome === 'number') return { ok: false, status: outcome };
      if (outcome !== 'accept') return { ok: false, error: outcome };
      const socket: FakeSocket = {
        events,
        sent: [],
        pongs: 0,
        closed: [],
        send(text) {
          socket.sent.push(text);
        },
        pong() {
          socket.pongs += 1;
        },
        close(code, reason) {
          socket.closed.push([code, reason]);
        },
      };
      sockets.push(socket);
      return { ok: true, socket };
    },
  };
  return transport;
}

let clock: ReturnType<typeof fakeClock>;
let transport: ReturnType<typeof fakeTransport>;
let events: DeviceEvent[];

beforeEach(() => {
  clock = fakeClock();
  transport = fakeTransport();
  events = [];
});

function device() {
  return createDevice({
    mac,
    transport,
    clock,
    onEvent: (event) => events.push(event),
  });
}

const statuses = () =>
  events.flatMap((event) => (event.kind === 'status' ? [event.text] : []));
const received = () =>
  events.flatMap((event) => (event.kind === 'received' ? [event.text] : []));
const sent = () =>
  events.flatMap((event) => (event.kind === 'sent' ? [event.text] : []));
const reconnectDelays = () =>
  statuses().flatMap((text) => {
    const match = /^reconnecting in (\d+)s/.exec(text);
    return match ? [Number(match[1])] : [];
  });
const lastSocket = () => transport.sockets.at(-1)!;

/** Starts a device that connects at once. */
async function connected() {
  const subject = device();
  subject.start();
  await flush();
  return subject;
}

describe('start', () => {
  it('connects when the server accepts it', async () => {
    const subject = await connected();
    expect(statuses()).toEqual(['connecting to /ws …', 'connected']);
    expect(subject.status().state).toBe('connected');
  });

  it('stops at "not enrolled" when the upgrade is refused with 403', async () => {
    transport.nextOpen = () => 403;
    const subject = device();
    subject.start();
    await flush();
    expect(received()).toEqual(['403 Forbidden']);
    expect(statuses()).toContain('not enrolled — run /enroll');
    expect(subject.status().state).toBe('offline');
    expect(clock.pending()).toBe(0);
  });

  it('retries with backoff when the server is unreachable on start', async () => {
    transport.nextOpen = () => 'server not reachable (connection refused)';
    device().start();
    await flush();
    await clock.advance(
      1_000 + 2_000 + 4_000 + 8_000 + 16_000 + 30_000 + 30_000,
    );
    expect(statuses()).toContain('server not reachable (connection refused)');
    expect(reconnectDelays()).toEqual([1, 2, 4, 8, 16, 30, 30, 30]);
  });
});

describe('reconnecting', () => {
  it('reconnects with backoff after an unexpected close, capped at 30 s', async () => {
    await connected();
    transport.nextOpen = () => 'server not reachable (connection refused)';
    lastSocket().events.close(1001, '');
    expect(received()).toContain('close 1001 server shutting down');
    await clock.advance(1_000 + 2_000 + 4_000 + 8_000 + 16_000 + 30_000);
    expect(reconnectDelays()).toEqual([1, 2, 4, 8, 16, 30, 30]);
  });

  it.each([4000, 1008, 1009])('reconnects after close %i', async (code) => {
    await connected();
    lastSocket().events.close(code, '');
    await clock.advance(1_000);
    expect(transport.opens).toBe(2);
    expect(statuses().at(-1)).toBe('connected');
  });

  it('starts the backoff again at 1 s after a successful reconnect', async () => {
    await connected();
    const outcomes: Outcome[] = ['down', 'accept'];
    transport.nextOpen = () => outcomes.shift() ?? 'accept';
    lastSocket().events.close(1001, '');
    await clock.advance(1_000 + 2_000);
    lastSocket().events.close(1001, '');
    expect(reconnectDelays()).toEqual([1, 2, 1]);
  });

  it('stops at "not enrolled" when a reconnect is refused with 403', async () => {
    await connected();
    transport.nextOpen = () => 403;
    lastSocket().events.close(1001, '');
    await clock.advance(1_000);
    expect(statuses().at(-1)).toBe('not enrolled — run /enroll');
    expect(clock.pending()).toBe(0);
  });
});

describe('frames', () => {
  it('logs each message exactly as received', async () => {
    await connected();
    lastSocket().events.message('{"type":"error","code":"INVALID_JSON"}');
    expect(received()).toContain('{"type":"error","code":"INVALID_JSON"}');
  });

  it('answers pings while pongs are on', async () => {
    await connected();
    lastSocket().events.ping();
    expect(lastSocket().pongs).toBe(1);
    expect(events).toContainEqual({
      kind: 'received',
      text: 'ping',
      dim: true,
    });
    expect(events).toContainEqual({ kind: 'sent', text: 'pong', dim: true });
  });

  it('ignores pings while pongs are off', async () => {
    const subject = await connected();
    subject.setPongs(false);
    lastSocket().events.ping();
    expect(lastSocket().pongs).toBe(0);
    expect(subject.status().pongs).toBe(false);
  });

  it('sends text exactly as given when connected', async () => {
    const subject = await connected();
    subject.send('{nope');
    expect(lastSocket().sent).toEqual(['{nope']);
    expect(sent()).toContain('{nope');
  });

  it('refuses to send when not connected', () => {
    const subject = device();
    subject.send('hello');
    expect(statuses()).toContain('not connected');
    expect(transport.sockets).toEqual([]);
  });

  it('sends a valid error message', async () => {
    const subject = await connected();
    subject.sendError('READ_TIMEOUT', 'IR receiver timed out');
    subject.sendError('BUSY');
    expect(lastSocket().sent).toEqual([
      '{"type":"error","code":"READ_TIMEOUT","message":"IR receiver timed out"}',
      '{"type":"error","code":"BUSY"}',
    ]);
  });

  it.each([
    ['an unknown code', 'NOPE', undefined],
    ['a message over 200 characters', 'BUSY', 'x'.repeat(201)],
  ])('refuses an error with %s', async (_case, code, message) => {
    const subject = await connected();
    subject.sendError(code, message);
    expect(lastSocket().sent).toEqual([]);
    expect(
      events.some(
        (event) =>
          event.kind === 'status' &&
          event.tone === 'error' &&
          event.text.startsWith('invalid message'),
      ),
    ).toBe(true);
  });
});

describe('disconnect', () => {
  it('closes with 1000 and does not reconnect', async () => {
    const subject = await connected();
    const socket = lastSocket();
    subject.disconnect();
    socket.events.close(1000, '');
    await clock.advance(60_000);
    expect(socket.closed).toEqual([[1000, 'disconnect']]);
    expect(transport.opens).toBe(1);
    expect(subject.status().state).toBe('offline');
  });
});

describe('enroll', () => {
  beforeEach(() => {
    transport.nextOpen = () => 403;
  });

  it('shows the code and connects once the owner has enrolled it', async () => {
    const subject = device();
    await subject.enroll();
    expect(sent()).toEqual(['POST /pairing-code']);
    expect(received()[0]).toMatch(/^201 Created \{"pairingCode":"7K4MQ9TX"/);
    expect(events).toContainEqual({
      kind: 'pairing',
      code: '7K4MQ9TX',
      expiresAt: start + 15 * 60_000,
      uri: 'airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX',
    });
    expect(subject.status()).toMatchObject({
      state: 'waiting-for-enrollment',
      pendingCode: { code: '7K4MQ9TX', expiresAt: start + 15 * 60_000 },
    });

    await clock.advance(10_000);
    expect(transport.opens).toBe(2);
    expect(events).toContainEqual({
      kind: 'received',
      text: '403 Forbidden',
      dim: true,
    });

    transport.nextOpen = () => 'accept';
    await clock.advance(5_000);
    expect(statuses().at(-1)).toBe('enrolled ✓ connected');
    expect(subject.status()).toMatchObject({
      state: 'connected',
      pendingCode: null,
    });
    expect(clock.pending()).toBe(0);
  });

  it('stops waiting when the code expires', async () => {
    const subject = device();
    await subject.enroll();
    await clock.advance(15 * 60_000);
    expect(statuses().at(-1)).toBe('pairing code expired — run /enroll again');
    expect(subject.status()).toMatchObject({
      state: 'offline',
      pendingCode: null,
    });
    expect(clock.pending()).toBe(0);
  });

  it('connects when the device is already enrolled', async () => {
    transport.pairing = async () => ({
      status: 409,
      body: { error: { code: 'DEVICE_ALREADY_REGISTERED', message: 'x' } },
    });
    transport.nextOpen = () => 'accept';
    const subject = device();
    await subject.enroll();
    await flush();
    expect(statuses()).toContain('already enrolled');
    expect(subject.status().state).toBe('connected');
  });

  it('stops on any other response', async () => {
    transport.pairing = async () => ({ status: 500, body: { error: {} } });
    const subject = device();
    await subject.enroll();
    expect(events.some((e) => e.kind === 'pairing')).toBe(false);
    expect(events.at(-1)).toMatchObject({ kind: 'status', tone: 'error' });
    expect(clock.pending()).toBe(0);
  });

  it('stops when the request fails', async () => {
    transport.pairing = async () => {
      throw new Error('server not reachable (connection refused)');
    };
    const subject = device();
    await subject.enroll();
    expect(events.at(-1)).toEqual({
      kind: 'status',
      text: 'server not reachable (connection refused)',
      tone: 'error',
    });
    expect(clock.pending()).toBe(0);
  });

  it.each<[string, () => Promise<HttpResult>]>([
    [
      'cannot reach the server',
      async () => {
        throw new Error('server not reachable (connection refused)');
      },
    ],
    ['gets an unexpected answer', async () => ({ status: 500, body: {} })],
  ])('keeps reconnecting when /enroll %s', async (_case, pairing) => {
    transport.nextOpen = () => 'server not reachable (connection refused)';
    const subject = device();
    subject.start();
    await flush();
    transport.pairing = pairing;
    await subject.enroll();
    expect(subject.status().state).toBe('offline');
    const opens = transport.opens;
    await clock.advance(30_000);
    expect(transport.opens).toBeGreaterThan(opens);
  });

  it('is offline, not connecting, when /enroll fails while an open is in flight', async () => {
    let release: (result: OpenResult) => void = () => {};
    transport.openSocket = () =>
      new Promise<OpenResult>((resolve) => {
        release = resolve;
      });
    const subject = device();
    subject.start();
    transport.pairing = async () => ({ status: 500, body: {} });
    await subject.enroll();
    expect(subject.status().state).toBe('offline');
    expect(clock.pending()).toBe(1);
    release({ ok: false, status: 403 });
  });

  it('replaces the pending code when run again', async () => {
    const subject = device();
    await subject.enroll();
    await clock.advance(10 * 60_000);
    transport.pairing = async () => ({
      status: 201,
      body: {
        pairingCode: 'ABCDEFGH',
        expiresAt: new Date(clock.now() + 15 * 60_000).toISOString(),
      },
    });
    await subject.enroll();
    await clock.advance(10 * 60_000);
    expect(subject.status().pendingCode?.code).toBe('ABCDEFGH');
    expect(statuses()).not.toContain(
      'pairing code expired — run /enroll again',
    );
  });

  it('stops waiting on /connect', async () => {
    const subject = device();
    await subject.enroll();
    transport.nextOpen = () => 'accept';
    subject.connect();
    await flush();
    expect(subject.status()).toMatchObject({
      state: 'connected',
      pendingCode: null,
    });
    expect(clock.pending()).toBe(0);
  });

  it('stops waiting on /disconnect', async () => {
    const subject = device();
    await subject.enroll();
    subject.disconnect();
    expect(subject.status().pendingCode).toBeNull();
    expect(clock.pending()).toBe(0);
  });
});

describe('stop', () => {
  it('stop clears every timer and closes with 1000', async () => {
    const subject = await connected();
    const socket = lastSocket();
    subject.stop();
    expect(socket.closed).toEqual([[1000, 'quit']]);
    expect(clock.pending()).toBe(0);
  });

  it('clears a pending reconnect', async () => {
    transport.nextOpen = () => 'down';
    const subject = device();
    subject.start();
    await flush();
    expect(clock.pending()).toBe(1);
    subject.stop();
    expect(clock.pending()).toBe(0);
  });

  it('clears an enrollment wait', async () => {
    transport.nextOpen = () => 403;
    const subject = device();
    await subject.enroll();
    subject.stop();
    expect(clock.pending()).toBe(0);
  });
});
