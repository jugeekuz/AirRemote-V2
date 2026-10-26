import { describe, expect, it } from 'vitest';
import { REMOTE_TYPES, remoteTypeSchema } from '../remotes.contract';

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
