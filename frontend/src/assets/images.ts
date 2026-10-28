import type { RemoteType } from '@airremote/contracts';

import active from './icons/active.svg';
import airremoteLogoShort from './icons/airremote-logo-short.svg';
import airremoteLogo from './icons/airremote-logo.png';
import avatar from './icons/avatar.svg';
import googleLogo from './icons/google-logo.svg';
import inactive from './icons/inactive.svg';
import remote from './icons/remote.svg';
import airWhiteSide from './imgs/air-white-side.png';
import airconditionerBlackSide from './imgs/airconditioner-black-side.png';
import dehumidifierBlack from './imgs/dehumidifier-black.png';
import dehumidifierWhite from './imgs/dehumidifier-white.png';
import genericDeviceBlue from './imgs/generic-device-blue.png';
import heaterBlack from './imgs/heater-black.png';
import heater2 from './imgs/heater2.png';
import microcontroller from './imgs/microcontroller3.png';
import rgbStrip from './imgs/rgb-strip.png';
import speakersBlack from './imgs/speakers-black.png';
import speakers from './imgs/speakers.png';
import tvGray from './imgs/tv-gray.png';
import tv from './imgs/tv.png';
import universalDevice from './imgs/universal-device.png';

/** An image to pass to `Image` from `@ui` as its `source`. */
export type ImageAsset = number;

/**
 * V1's pictures (copied from V1's assets; see the V1 look inventory,
 * "Assets used by these pages"). Render them with `Image` from `@ui`.
 */
export const IMAGES = Object.freeze({
  /** The "AirRemote" wordmark with the mark, 3361×696 (Login, Sign up). */
  logo: airremoteLogo,
  /** The two-parallelogram mark alone, 164×171 (top bar). */
  logoShort: airremoteLogoShort,
  /** The account avatar, a square (top bar). */
  avatar,
  /** Google's four-colour "G", a square (Login). */
  googleLogo,
  /** A remote with Wi-Fi arcs, `currentColor`: tint it (tab bar). */
  remote,
  /** The green status dot, a square. */
  online: active,
  /** The red status dot, a square. */
  offline: inactive,
  /** The board on every device tile, 252×175. */
  microcontroller,
});

/** The appliance on a remote's tile (light pictures), by remote type. */
export const REMOTE_TILE_IMAGES: Readonly<Record<RemoteType, ImageAsset>> =
  Object.freeze({
    air_conditioner: airWhiteSide,
    audio_system: speakers,
    dehumidifier: dehumidifierWhite,
    heater: heater2,
    rgb_lights: rgbStrip,
    smart_tv: tv,
    generic_device: universalDevice,
  });

/** The appliance on a remote's dark info card, by remote type. */
export const REMOTE_INFO_IMAGES: Readonly<Record<RemoteType, ImageAsset>> =
  Object.freeze({
    air_conditioner: airconditionerBlackSide,
    audio_system: speakersBlack,
    dehumidifier: dehumidifierBlack,
    heater: heaterBlack,
    rgb_lights: rgbStrip,
    smart_tv: tvGray,
    generic_device: genericDeviceBlue,
  });
