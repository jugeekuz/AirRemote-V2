import { REMOTE_TYPES } from '@airremote/contracts';

import { REMOTE_INFO_IMAGES, REMOTE_TILE_IMAGES } from '@assets/images';

import {
  getRemoteInfoPicture,
  getRemoteTilePicture,
  getRemoteTypeLabelKey,
} from './remote-types.helpers';

describe('getRemoteTypeLabelKey', () => {
  it.each([
    ['air_conditioner', 'remote-type.air-conditioner'],
    ['audio_system', 'remote-type.audio-system'],
    ['dehumidifier', 'remote-type.dehumidifier'],
    ['heater', 'remote-type.heater'],
    ['rgb_lights', 'remote-type.rgb-lights'],
    ['smart_tv', 'remote-type.smart-tv'],
    ['generic_device', 'remote-type.generic-device'],
  ] as const)('names %s by %s', (type, key) => {
    expect(getRemoteTypeLabelKey(type)).toBe(key);
  });

  it("keeps V1's order of the categories", () => {
    expect(REMOTE_TYPES.map(getRemoteTypeLabelKey)).toEqual([
      'remote-type.air-conditioner',
      'remote-type.audio-system',
      'remote-type.dehumidifier',
      'remote-type.heater',
      'remote-type.rgb-lights',
      'remote-type.smart-tv',
      'remote-type.generic-device',
    ]);
  });
});

describe('getRemoteTilePicture', () => {
  it.each(REMOTE_TYPES)('shows the light picture of %s', (type) => {
    expect(getRemoteTilePicture(type).source).toBe(REMOTE_TILE_IMAGES[type]);
  });

  it("moves V1's cropped pictures left as V1 did", () => {
    expect(getRemoteTilePicture('dehumidifier').nudgeClassName).toBe('-ml-2');
    expect(getRemoteTilePicture('audio_system').nudgeClassName).toBe('-ml-1');
    expect(getRemoteTilePicture('air_conditioner').nudgeClassName).toBe('');
    expect(getRemoteTilePicture('smart_tv').nudgeClassName).toBe('');
  });

  it("gives each picture's width over its height", () => {
    expect(getRemoteTilePicture('air_conditioner').aspectRatio).toBeCloseTo(
      328 / 226,
    );
    expect(getRemoteTilePicture('heater').aspectRatio).toBeCloseTo(982 / 701);
  });
});

describe('getRemoteInfoPicture', () => {
  it.each(REMOTE_TYPES)('shows the dark picture of %s', (type) => {
    expect(getRemoteInfoPicture(type).source).toBe(REMOTE_INFO_IMAGES[type]);
  });

  it("nudges the pictures as V1's info card did", () => {
    expect(getRemoteInfoPicture('air_conditioner').nudgeClassName).toBe('');
    expect(getRemoteInfoPicture('generic_device').nudgeClassName).toBe('ml-1');
    expect(getRemoteInfoPicture('rgb_lights').nudgeClassName).toBe('-mb-2');
    expect(getRemoteInfoPicture('smart_tv').nudgeClassName).toBe('-mb-1 ml-1');
  });

  it("gives each picture's width over its height", () => {
    expect(getRemoteInfoPicture('air_conditioner').aspectRatio).toBeCloseTo(
      800 / 408,
    );
    expect(getRemoteInfoPicture('smart_tv').aspectRatio).toBeCloseTo(600 / 493);
  });
});
