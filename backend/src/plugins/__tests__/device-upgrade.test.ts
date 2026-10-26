import type { FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizedDevice } from '../../shared/device-messages';
import { checkDeviceUpgrade } from '../device-upgrade';

const device = { id: 'device-1', macAddress: 'AA:BB:CC:DD:EE:01' };

let log: { error: ReturnType<typeof vi.fn> };
let authorize: ReturnType<
  typeof vi.fn<(commonName: string) => Promise<AuthorizedDevice | null>>
>;

/** An upgrade request; a null protocol sends no Sec-WebSocket-Protocol header. */
function upgradeRequest({
  protocol = 'airremote.v1',
  subject = { CN: 'AA:BB:CC:DD:EE:01' },
}: { protocol?: string | null; subject?: { CN?: unknown } } = {}) {
  return {
    headers: protocol === null ? {} : { 'sec-websocket-protocol': protocol },
    raw: { socket: { getPeerCertificate: () => ({ subject }) } },
    log,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  log = { error: vi.fn() };
  authorize = vi.fn(async () => device);
});

describe('checkDeviceUpgrade', () => {
  it('allows a device the allowlist knows, looked up by its CN', async () => {
    await expect(
      checkDeviceUpgrade(upgradeRequest(), authorize),
    ).resolves.toEqual({ ok: true, device });
    expect(authorize).toHaveBeenCalledWith('AA:BB:CC:DD:EE:01');
  });

  it('finds the subprotocol among several requested', async () => {
    const request = upgradeRequest({ protocol: 'chat, airremote.v1' });
    const decision = await checkDeviceUpgrade(request, authorize);
    expect(decision.ok).toBe(true);
  });

  it.each([
    ['no subprotocol', null],
    ['another subprotocol', 'airremote.v2'],
  ])('refuses %s with 400 before authorizing', async (_case, protocol) => {
    const request = upgradeRequest({ protocol });
    await expect(checkDeviceUpgrade(request, authorize)).resolves.toEqual({
      ok: false,
      status: 400,
      reason: 'unsupported subprotocol',
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    ['two CNs', { CN: ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:03'] }],
    ['no CN', {}],
  ])('refuses a certificate with %s with 403', async (_case, subject) => {
    const request = upgradeRequest({ subject });
    await expect(checkDeviceUpgrade(request, authorize)).resolves.toEqual({
      ok: false,
      status: 403,
      reason: 'no single certificate CN',
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('refuses a device the allowlist does not know with 403', async () => {
    authorize.mockResolvedValue(null);
    await expect(
      checkDeviceUpgrade(upgradeRequest(), authorize),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      reason: 'device not allowed',
      commonName: 'AA:BB:CC:DD:EE:01',
    });
  });

  it('refuses with 403 and logs when authorizing fails', async () => {
    const error = new Error('database is down');
    authorize.mockRejectedValue(error);
    await expect(
      checkDeviceUpgrade(upgradeRequest(), authorize),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      reason: 'device not allowed',
      commonName: 'AA:BB:CC:DD:EE:01',
    });
    expect(log.error).toHaveBeenCalledWith(
      { err: error },
      'Device authorization failed',
    );
  });
});
