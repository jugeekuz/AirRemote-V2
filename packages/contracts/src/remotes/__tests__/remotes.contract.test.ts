import { describe, expect, it } from 'vitest';
import {
  REMOTE_TYPES,
  createRemoteRequestSchema,
  remoteResponseSchema,
  remoteTypeSchema,
} from '../remotes.contract';

describe('REMOTE_TYPES', () => {
  it('lists the seven remote types in order', () => {
    expect(REMOTE_TYPES).toEqual([
      'air_conditioner',
      'audio_system',
      'dehumidifier',
      'heater',
      'rgb_lights',
      'smart_tv',
      'generic_device',
    ]);
  });
});

describe('remoteTypeSchema', () => {
  it.each(REMOTE_TYPES)('accepts %s', (type) => {
    expect(remoteTypeSchema.parse(type)).toBe(type);
  });

  it.each(['Air Conditioner', 'tv', ''])('rejects %j', (type) => {
    expect(remoteTypeSchema.safeParse(type).success).toBe(false);
  });
});

describe('createRemoteRequestSchema', () => {
  it('accepts a valid body and trims the name', () => {
    expect(
      createRemoteRequestSchema.parse({
        name: ' Living room ',
        type: 'smart_tv',
      }),
    ).toEqual({ name: 'Living room', type: 'smart_tv' });
  });

  it('rejects a bad type', () => {
    expect(
      createRemoteRequestSchema.safeParse({ name: 'TV', type: 'tv' }).success,
    ).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(
      createRemoteRequestSchema.safeParse({ type: 'smart_tv' }).success,
    ).toBe(false);
  });
});

describe('remoteResponseSchema', () => {
  it('accepts a remote', () => {
    const body = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      deviceId: '0b6f8a52-3c1e-4d7a-9f10-5a2b8c4d6e11',
      name: 'TV',
      type: 'smart_tv',
    };
    expect(remoteResponseSchema.parse(body)).toEqual(body);
  });
});
