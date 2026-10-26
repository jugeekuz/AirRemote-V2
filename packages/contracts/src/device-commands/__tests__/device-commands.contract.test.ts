import { describe, expect, it } from 'vitest';
import {
  deviceCommandKindSchema,
  deviceCommandResponseSchema,
} from '../device-commands.contract';

const base = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  kind: 'learn_button',
  createdAt: '2026-10-26T10:00:00.000Z',
  expiresAt: '2026-10-26T10:00:30.000Z',
};

describe('deviceCommandResponseSchema', () => {
  it('accepts a pending command', () => {
    const body = { ...base, status: 'pending' };
    expect(deviceCommandResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts a succeeded command with its button', () => {
    const body = {
      ...base,
      status: 'succeeded',
      button: {
        id: '0b6f8a52-3c1e-4d7a-9f10-5a2b8c4d6e11',
        remoteId: '5d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        name: 'Power',
      },
    };
    expect(deviceCommandResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts a failed command with its error', () => {
    const body = {
      ...base,
      status: 'failed',
      error: { code: 'IR_READ_TIMEOUT', message: 'No signal received' },
    };
    expect(deviceCommandResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects an unknown status', () => {
    expect(
      deviceCommandResponseSchema.safeParse({ ...base, status: 'done' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(
      deviceCommandResponseSchema.safeParse({
        ...base,
        kind: 'other',
        status: 'pending',
      }).success,
    ).toBe(false);
  });
});

describe('deviceCommandKindSchema', () => {
  it('accepts send_ir', () => {
    expect(deviceCommandKindSchema.parse('send_ir')).toBe('send_ir');
  });
});
