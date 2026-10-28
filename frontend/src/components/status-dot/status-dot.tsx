import { useTranslation } from 'react-i18next';

import { Image } from '@ui';
import { IMAGES } from '@assets/images';

/** V1's dot: 10 px on tiles, 12 px on the remote's info card. */
export type StatusDotSize = 'sm' | 'md';

type StatusDotProps = {
  online: boolean;
  /** @default 'sm' */
  size?: StatusDotSize;
};

const SIZE_CLASS: Record<StatusDotSize, string> = {
  sm: 'size-2.5',
  md: 'size-3',
};

/** V1's glossy status dot: green when the device is online, red when not. */
export default function StatusDot({ online, size = 'sm' }: StatusDotProps) {
  const { t } = useTranslation('chrome');

  return (
    <Image
      source={online ? IMAGES.online : IMAGES.offline}
      contentFit="contain"
      className={SIZE_CLASS[size]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        online ? t('status-dot.online') : t('status-dot.offline')
      }
    />
  );
}
