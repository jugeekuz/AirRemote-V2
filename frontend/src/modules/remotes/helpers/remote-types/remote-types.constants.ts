import type { RemoteType } from '@airremote/contracts';

/** Each type's label in the `remotes` namespace (V1's category names). */
export const REMOTE_TYPE_LABEL_KEY = Object.freeze({
  air_conditioner: 'remote-type.air-conditioner',
  audio_system: 'remote-type.audio-system',
  dehumidifier: 'remote-type.dehumidifier',
  heater: 'remote-type.heater',
  rgb_lights: 'remote-type.rgb-lights',
  smart_tv: 'remote-type.smart-tv',
  generic_device: 'remote-type.generic-device',
} as const satisfies Record<RemoteType, string>);

export type RemoteTypeLabelKey =
  (typeof REMOTE_TYPE_LABEL_KEY)[keyof typeof REMOTE_TYPE_LABEL_KEY];

type PictureLayout = { nudgeClassName: string; aspectRatio: number };

/** The tile pictures' sizes in pixels, and V1's offsets for the cropped ones. */
export const REMOTE_TILE_PICTURE_LAYOUT: Readonly<
  Record<RemoteType, PictureLayout>
> = Object.freeze({
  air_conditioner: { nudgeClassName: '', aspectRatio: 328 / 226 },
  audio_system: { nudgeClassName: '-ml-1', aspectRatio: 600 / 427 },
  dehumidifier: { nudgeClassName: '-ml-2', aspectRatio: 345 / 254 },
  heater: { nudgeClassName: '', aspectRatio: 982 / 701 },
  rgb_lights: { nudgeClassName: '', aspectRatio: 537 / 384 },
  smart_tv: { nudgeClassName: '', aspectRatio: 500 / 421 },
  generic_device: { nudgeClassName: '', aspectRatio: 628 / 448 },
});

/** The info card pictures' sizes in pixels, and V1's offsets. */
export const REMOTE_INFO_PICTURE_LAYOUT: Readonly<
  Record<RemoteType, PictureLayout>
> = Object.freeze({
  air_conditioner: { nudgeClassName: '', aspectRatio: 800 / 408 },
  audio_system: { nudgeClassName: 'ml-1', aspectRatio: 500 / 419 },
  dehumidifier: { nudgeClassName: 'ml-1', aspectRatio: 500 / 444 },
  heater: { nudgeClassName: 'ml-1', aspectRatio: 500 / 383 },
  rgb_lights: { nudgeClassName: '-mb-2', aspectRatio: 537 / 384 },
  smart_tv: { nudgeClassName: '-mb-1 ml-1', aspectRatio: 600 / 493 },
  generic_device: { nudgeClassName: 'ml-1', aspectRatio: 481 / 378 },
});
