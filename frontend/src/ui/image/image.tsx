import { Image as ExpoImage } from 'expo-image';
import { withUniwind } from 'uniwind';

/**
 * `expo-image`'s Image (PNG and SVG on Android, iOS and web), styled with
 * `className`. `tintColorClassName` tints a one-colour picture with an
 * `accent-*` class (`accent-green-500`). Pass a picture from
 * `@assets/images` as `source`.
 */
const Image = withUniwind(ExpoImage);

export default Image;
