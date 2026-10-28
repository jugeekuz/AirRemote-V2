import type { RemoteType } from '@airremote/contracts';

import {
  REMOTE_INFO_IMAGES,
  REMOTE_TILE_IMAGES,
  type ImageAsset,
} from '@assets/images';

import {
  REMOTE_INFO_PICTURE_LAYOUT,
  REMOTE_TILE_PICTURE_LAYOUT,
  REMOTE_TYPE_LABEL_KEY,
  type RemoteTypeLabelKey,
} from './remote-types.constants';

/** An appliance picture and how V1 placed it. */
export type RemotePicture = {
  source: ImageAsset;
  /** V1's per-picture offset (`-ml-2`, `-mb-1 ml-1`, …); may be empty. */
  nudgeClassName: string;
  /** Width over height, for a box that keeps the picture's full height. */
  aspectRatio: number;
};

/** The i18n key (namespace `remotes`) of the type's label, e.g. "Air Conditioner". */
export function getRemoteTypeLabelKey(type: RemoteType): RemoteTypeLabelKey {
  return REMOTE_TYPE_LABEL_KEY[type];
}

/** The light picture on a remote's tile. */
export function getRemoteTilePicture(type: RemoteType): RemotePicture {
  return {
    source: REMOTE_TILE_IMAGES[type],
    ...REMOTE_TILE_PICTURE_LAYOUT[type],
  };
}

/** The dark picture on the remote's info card (Remote details). */
export function getRemoteInfoPicture(type: RemoteType): RemotePicture {
  return {
    source: REMOTE_INFO_IMAGES[type],
    ...REMOTE_INFO_PICTURE_LAYOUT[type],
  };
}
