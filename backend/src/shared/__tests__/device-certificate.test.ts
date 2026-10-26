import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { peerCommonName } from '../device-certificate';

function requestWith(subject: { CN?: unknown } | undefined) {
  return {
    raw: { socket: { getPeerCertificate: () => ({ subject }) } },
  } as unknown as FastifyRequest;
}

describe('peerCommonName', () => {
  it('returns a single CN', () => {
    expect(peerCommonName(requestWith({ CN: 'AA:BB:CC:DD:EE:01' }))).toBe(
      'AA:BB:CC:DD:EE:01',
    );
  });

  it('returns null for two CNs', () => {
    expect(
      peerCommonName(
        requestWith({ CN: ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:03'] }),
      ),
    ).toBeNull();
  });

  it('returns null without a subject', () => {
    expect(peerCommonName(requestWith(undefined))).toBeNull();
  });
});
