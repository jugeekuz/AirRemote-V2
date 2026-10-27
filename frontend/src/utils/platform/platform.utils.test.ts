import {
  isAndroidPlatform,
  isIOSPlatform,
  isNativeMobilePlatform,
  isWebPlatform,
} from './platform.utils';

describe('platform utils', () => {
  it('reports the platform jest-expo runs as', () => {
    expect(isIOSPlatform).toBe(true);
    expect(isAndroidPlatform).toBe(false);
    expect(isWebPlatform).toBe(false);
    expect(isNativeMobilePlatform).toBe(true);
  });
});
