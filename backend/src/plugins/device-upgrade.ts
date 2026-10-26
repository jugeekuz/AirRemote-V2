import type { TLSSocket } from 'node:tls';
import { DEVICE_SUBPROTOCOL } from '@airremote/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthorizedDevice } from '../shared/device-messages';

/** Decides from the client certificate's Subject CN; null or a throw rejects. */
export type AuthorizeDevice = (
  commonName: string,
) => Promise<AuthorizedDevice | null>;

/** Whether a WebSocket upgrade may go ahead, or the HTTP status that refuses it. */
export type UpgradeDecision =
  | { ok: true; device: AuthorizedDevice }
  | { ok: false; status: 400 | 403; reason: string; commonName?: string };

function requestsDeviceProtocol(request: FastifyRequest): boolean {
  const header = request.headers['sec-websocket-protocol'] ?? '';
  return header
    .split(',')
    .some((protocol) => protocol.trim() === DEVICE_SUBPROTOCOL);
}

function peerCommonName(request: FastifyRequest): string | null {
  const socket = request.raw.socket as TLSSocket;
  // With two CN attributes Node returns an array; only a single CN identifies a device.
  const commonName: unknown = socket.getPeerCertificate().subject?.CN;
  return typeof commonName === 'string' ? commonName : null;
}

/**
 * Checks a device's upgrade request, in order: the subprotocol, a single
 * certificate CN, then the allowlist. A failing `authorize` refuses it.
 */
export async function checkDeviceUpgrade(
  request: FastifyRequest,
  authorize: AuthorizeDevice,
): Promise<UpgradeDecision> {
  if (!requestsDeviceProtocol(request)) {
    return { ok: false, status: 400, reason: 'unsupported subprotocol' };
  }

  const commonName = peerCommonName(request);
  if (commonName === null) {
    return { ok: false, status: 403, reason: 'no single certificate CN' };
  }

  try {
    const device = await authorize(commonName);
    if (device) return { ok: true, device };
  } catch (error) {
    request.log.error({ err: error }, 'Device authorization failed');
  }
  return { ok: false, status: 403, reason: 'device not allowed', commonName };
}
