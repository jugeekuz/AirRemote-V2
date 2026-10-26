import type { TLSSocket } from 'node:tls';
import type { FastifyRequest } from 'fastify';

/** The Subject CN of the device's client certificate, or null unless there is exactly one. */
export function peerCommonName(request: FastifyRequest): string | null {
  const socket = request.raw.socket as TLSSocket;
  // With two CN attributes Node returns an array; only a single CN identifies a device.
  const commonName: unknown = socket.getPeerCertificate().subject?.CN;
  return typeof commonName === 'string' ? commonName : null;
}
