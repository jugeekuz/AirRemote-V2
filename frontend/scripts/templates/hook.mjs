// @ts-check
import { appendLine, layerDir } from './shared.mjs';

/**
 * A hook is `use-<name>`; a leading `use-` in the name is not repeated.
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  const base = ctx.names.kebab.replace(/^use-(?=.)/, '');
  const hookName = `use${ctx.names.pascal.replace(/^Use(?=[A-Z0-9])/, '')}`;
  const file = `use-${base}`;
  const layer = layerDir(ctx, 'hooks');
  const dir = `${layer}/${file}`;
  return {
    files: [
      { path: `${dir}/${file}.ts`, content: hook(hookName) },
      { path: `${dir}/${file}.test.ts`, content: hookTest(hookName, file) },
      { path: `${dir}/index.ts`, content: `export * from './${file}';\n` },
    ],
    // Global hooks are imported by folder (@hooks/use-x). A module's are
    // collected in its hooks/index.ts.
    edits: ctx.module
      ? [appendLine(`${layer}/index.ts`, `export * from './${file}';`)]
      : [],
    notes: [],
    hints: [],
  };
}

/** @param {string} hookName */
export function hook(hookName) {
  return `import { useCallback, useState } from 'react';

/** Tracks an on/off flag. */
export function ${hookName}(): { isOn: boolean; toggle: () => void } {
  const [isOn, setIsOn] = useState(false);

  const toggle = useCallback(() => {
    setIsOn((current) => !current);
  }, []);

  return { isOn, toggle };
}
`;
}

/**
 * @param {string} hookName
 * @param {string} file
 */
export function hookTest(hookName, file) {
  return `import { act, renderHook } from '@utils/tests';

import { ${hookName} } from './${file}';

describe('${hookName}', () => {
  it('starts off', async () => {
    const { result } = await renderHook(() => ${hookName}());

    expect(result.current.isOn).toBe(false);
  });

  it('toggles', async () => {
    const { result } = await renderHook(() => ${hookName}());

    await act(async () => {
      result.current.toggle();
    });

    expect(result.current.isOn).toBe(true);
  });
});
`;
}
