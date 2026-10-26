import { afterEach, describe, expect, inject, it } from 'vitest';
import type { TestClientName } from '../../../backend/e2e/support/device-certs.global-setup';
import { useDeviceServer } from '../../../backend/e2e/support/device-server';
import { createDevice, type Device, type DeviceEvent } from '../src/device';
import { createNodeTransport, systemClock } from '../src/node-transport';

const server = useDeviceServer({ api: true });
const mac = 'AA:BB:CC:DD:EE:01';
const running: Device[] = [];

afterEach(() => {
  for (const device of running.splice(0)) device.stop();
});

/** A simulated device presenting one of the run's client certificates. */
function simulated(cert: TestClientName) {
  const certs = inject('deviceCerts');
  const events: DeviceEvent[] = [];
  const device = createDevice({
    mac,
    transport: createNodeTransport({
      server: new URL(server.url.replace(/^wss:/, 'https:')).origin,
      identity: { ca: certs.ca, ...certs.clients[cert] },
    }),
    clock: systemClock,
    onEvent: (event) => events.push(event),
    enrollRetryMs: 200,
  });
  running.push(device);

  async function waitFor<T extends DeviceEvent>(
    predicate: (event: DeviceEvent) => event is T,
    timeoutMs?: number,
  ): Promise<T>;
  async function waitFor(
    predicate: (event: DeviceEvent) => boolean,
    timeoutMs?: number,
  ): Promise<DeviceEvent>;
  async function waitFor(
    predicate: (event: DeviceEvent) => boolean,
    timeoutMs = 5_000,
  ) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = events.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(`no matching event in ${JSON.stringify(events)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  return { device, events, waitFor };
}

const statusIs = (text: string) => (event: DeviceEvent) =>
  event.kind === 'status' && event.text === text;

function postToApi(path: string, body: unknown, token?: string) {
  return fetch(`${server.apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** What the owner does: sign up, log in, and enroll the device with its code. */
async function ownerEnrolls(pairingCode: string) {
  const user = {
    email: 'nick@example.com',
    firstName: 'Nick',
    lastName: 'Papas',
    password: 'correct horse',
  };
  await postToApi('/users/register', user);
  const login = await postToApi('/auth/login', {
    email: user.email,
    password: user.password,
  });
  const { accessToken } = await login.json();
  const res = await postToApi(
    '/devices',
    { macAddress: 'aa:bb:cc:dd:ee:01', pairingCode, name: 'Living room' },
    accessToken,
  );
  expect(res.status).toBe(201);
}

describe('the simulated device against the device listener', () => {
  it('starts unenrolled', async () => {
    const { device, waitFor } = simulated('allowed');
    device.start();
    await waitFor(statusIs('not enrolled — run /enroll'));
  });

  it('enrolls once the owner has enrolled it', async () => {
    const { device, events, waitFor } = simulated('allowed');
    await device.enroll();
    const pairing = await waitFor(
      (event): event is Extract<DeviceEvent, { kind: 'pairing' }> =>
        event.kind === 'pairing',
    );
    await ownerEnrolls(pairing.code);
    await waitFor(statusIs('enrolled ✓ connected'));

    device.sendError('INTERNAL', 'IR receiver timed out');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(events).toContainEqual({
      kind: 'sent',
      text: '{"type":"error","code":"INTERNAL","message":"IR receiver timed out"}',
    });
    expect(
      events.some(
        (event) => event.kind === 'received' && event.text.includes('"error"'),
      ),
    ).toBe(false);
  });

  it("logs the server's error reply to a bad frame", async () => {
    await server.allowDevice('aa:bb:cc:dd:ee:01');
    const { device, waitFor } = simulated('allowed');
    device.start();
    await waitFor(statusIs('connected'));
    device.send('{nope');
    const reply = await waitFor(
      (event) => event.kind === 'received' && event.text.startsWith('{'),
    );
    expect(JSON.parse((reply as { text: string }).text)).toMatchObject({
      type: 'error',
      code: 'INVALID_JSON',
    });
  });

  it('reports an untrusted certificate in plain words', async () => {
    const { device, waitFor } = simulated('foreignCa');
    device.start();
    await waitFor(
      (event) =>
        event.kind === 'status' &&
        event.tone === 'error' &&
        event.text.includes("trust this device's certificate"),
    );
  });
});
