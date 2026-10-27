// @ts-check
import { GeneratorError, layerDir, toNames } from './shared.mjs';

const PERSIST_KEYS_FILE = 'src/stores/stores.constants.ts';

/**
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  // `store Session` and `store SessionStore` are the same store.
  const base = ctx.names.kebab.replace(/(?<=.)-store$/, '');
  const { pascal, camel, constant } = toNames(base, 'store name');
  const dir = `${layerDir(ctx, 'stores')}/${base}`;
  // A module's store gets the module in its persist key, so it can't clash
  // with a global store of the same name.
  const keyName = ctx.module ? `${ctx.module}-${base}` : base;
  const key = keyName.toUpperCase().replaceAll('-', '_');
  const value = `${keyName}-store`;

  /** @type {import('./shared.mjs').Plan} */
  const result = {
    files: [
      {
        path: `${dir}/${base}.store.ts`,
        content: ctx.persisted
          ? persistedStore(pascal, camel, constant, key)
          : store(pascal, camel, constant),
      },
      {
        path: `${dir}/${base}.store.test.ts`,
        content: ctx.persisted
          ? persistedStoreTest(base, camel, key)
          : storeTest(base, camel),
      },
      {
        path: `${dir}/index.ts`,
        content: `export * from './${base}.store';\n`,
      },
    ],
    edits: [],
    notes: [],
    hints: [
      ctx.module
        ? `If ${camel}Store holds data of the signed-in user, reset it when the module's screens unmount (they do on sign-out): call ${camel}Store.reset() in the cleanup of an effect in the module's entry hook. authStore.signOut can't reset it, since shared layers never import @modules; a store that must reset with the session belongs in src/stores.`
        : `If ${camel}Store holds data of the signed-in user, call ${camel}Store.reset() in authStore.signOut (src/stores/auth/auth.store.ts).`,
    ],
  };

  if (ctx.persisted) {
    result.edits.push({
      path: PERSIST_KEYS_FILE,
      update: (current) => addPersistKey(current, key, value),
    });
  }
  return result;
}

/**
 * @param {string | null} current
 * @param {string} key
 * @param {string} value
 */
function addPersistKey(current, key, value) {
  const text =
    current ??
    `export const STORE_PERSIST_KEY = Object.freeze({\n} as const);\n`;
  if (new RegExp(`^\\s+${key}:`, 'm').test(text)) {
    throw new GeneratorError(
      `${PERSIST_KEYS_FILE} already has STORE_PERSIST_KEY.${key}. Pick another store name.`,
    );
  }
  const close = '} as const);';
  if (!text.includes(`\n${close}`)) {
    throw new GeneratorError(
      `Could not find "${close}" in ${PERSIST_KEYS_FILE} to add STORE_PERSIST_KEY.${key}.`,
    );
  }
  return text.replace(`\n${close}`, `\n  ${key}: '${value}',\n${close}`);
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} constant
 */
export function store(pascal, camel, constant) {
  return `import { create } from 'zustand';

type ${pascal}State = {
  isEnabled: boolean;
};

const INITIAL_${constant}_STATE: ${pascal}State = {
  isEnabled: false,
};

const use${pascal}Store = create<${pascal}State>()(
  () => INITIAL_${constant}_STATE,
);

/** Owns the ${pascal} state. Nothing is persisted; it starts again on every launch. */
export const ${camel}Store = {
  setIsEnabled(isEnabled: boolean) {
    use${pascal}Store.setState({ isEnabled });
  },
  reset() {
    use${pascal}Store.setState(INITIAL_${constant}_STATE);
  },

  getIsEnabled: () => use${pascal}Store.getState().isEnabled,

  useIsEnabled: () => use${pascal}Store((state) => state.isEnabled),
};
`;
}

/**
 * @param {string} base
 * @param {string} camel
 */
export function storeTest(base, camel) {
  return `import { act, renderHook } from '@testing-library/react-native';

import { ${camel}Store } from './${base}.store';

beforeEach(() => {
  ${camel}Store.reset();
});

describe('${camel}Store', () => {
  it('starts disabled', () => {
    expect(${camel}Store.getIsEnabled()).toBe(false);
  });

  it('setIsEnabled updates the value', () => {
    ${camel}Store.setIsEnabled(true);

    expect(${camel}Store.getIsEnabled()).toBe(true);
  });

  it('useIsEnabled reads the value reactively', async () => {
    const { result } = await renderHook(() => ${camel}Store.useIsEnabled());
    expect(result.current).toBe(false);

    await act(async () => {
      ${camel}Store.setIsEnabled(true);
    });
    expect(result.current).toBe(true);
  });

  it('reset returns to the initial state', () => {
    ${camel}Store.setIsEnabled(true);

    ${camel}Store.reset();

    expect(${camel}Store.getIsEnabled()).toBe(false);
  });
});
`;
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} constant
 * @param {string} key
 */
export function persistedStore(pascal, camel, constant, key) {
  return `import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { persistStorage } from '@adapters/storage';
import { STORE_PERSIST_KEY } from '@stores/stores.constants';

type ${pascal}State = {
  isEnabled: boolean;
};

const INITIAL_${constant}_STATE: ${pascal}State = {
  isEnabled: false,
};

const use${pascal}Store = create<${pascal}State>()(
  persist(() => INITIAL_${constant}_STATE, {
    name: STORE_PERSIST_KEY.${key},
    storage: createJSONStorage(() => persistStorage),
    // Raise it, and add a \`migrate\`, when the persisted shape changes.
    version: 1,
  }),
);

/** Owns the ${pascal} state, kept across restarts. */
export const ${camel}Store = {
  setIsEnabled(isEnabled: boolean) {
    use${pascal}Store.setState({ isEnabled });
  },
  reset() {
    use${pascal}Store.setState(INITIAL_${constant}_STATE);
  },
  /** Reads the persisted value again. The store already did so when it was created. */
  rehydrate: () => use${pascal}Store.persist.rehydrate(),

  getIsEnabled: () => use${pascal}Store.getState().isEnabled,

  useIsEnabled: () => use${pascal}Store((state) => state.isEnabled),
};
`;
}

/**
 * @param {string} base
 * @param {string} camel
 * @param {string} key
 */
export function persistedStoreTest(base, camel, key) {
  return `import { act, renderHook } from '@testing-library/react-native';

import { persistStorage } from '@adapters/storage';
import { STORE_PERSIST_KEY } from '@stores/stores.constants';

import { ${camel}Store } from './${base}.store';

// The mocked \`persistStorage\` keeps its Map for the whole file, so each test
// starts from an empty one as well as from the store's initial state.
beforeEach(() => {
  ${camel}Store.reset();
  persistStorage.removeItem(STORE_PERSIST_KEY.${key});
});

describe('${camel}Store', () => {
  it('starts disabled', () => {
    expect(${camel}Store.getIsEnabled()).toBe(false);
  });

  it('setIsEnabled updates the value and persists it', () => {
    ${camel}Store.setIsEnabled(true);

    expect(${camel}Store.getIsEnabled()).toBe(true);
    const raw = persistStorage.getItem(STORE_PERSIST_KEY.${key});
    expect(JSON.parse(raw ?? 'null')).toEqual({
      state: { isEnabled: true },
      version: 1,
    });
  });

  it('rehydrate restores the value persisted by an earlier run', async () => {
    persistStorage.setItem(
      STORE_PERSIST_KEY.${key},
      JSON.stringify({ state: { isEnabled: true }, version: 1 }),
    );

    await ${camel}Store.rehydrate();

    expect(${camel}Store.getIsEnabled()).toBe(true);
  });

  it('useIsEnabled reads the value reactively', async () => {
    const { result } = await renderHook(() => ${camel}Store.useIsEnabled());
    expect(result.current).toBe(false);

    await act(async () => {
      ${camel}Store.setIsEnabled(true);
    });
    expect(result.current).toBe(true);
  });

  it('reset returns to the initial state', () => {
    ${camel}Store.setIsEnabled(true);

    ${camel}Store.reset();

    expect(${camel}Store.getIsEnabled()).toBe(false);
  });
});
`;
}
