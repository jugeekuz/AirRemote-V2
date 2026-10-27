import { createMMKV } from 'react-native-mmkv';

import type { KeyValueStorage } from '@app-types';

const mmkv = createMMKV({ id: 'airremote' });

/** Synchronous persistent storage (MMKV; on web it is backed by localStorage). */
export const persistStorage: KeyValueStorage = {
  getItem: (key) => mmkv.getString(key) ?? null,
  setItem: (key, value) => {
    mmkv.set(key, value);
  },
  removeItem: (key) => {
    mmkv.remove(key);
  },
};
