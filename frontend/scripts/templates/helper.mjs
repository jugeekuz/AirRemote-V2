// @ts-check
import { layerDir } from './shared.mjs';

/**
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  const { kebab, pascal, constant } = ctx.names;
  const dir = `${layerDir(ctx, 'helpers')}/${kebab}`;
  const fallback = `${constant}_FALLBACK_LABEL`;
  const helper = `format${pascal}`;
  return {
    files: [
      {
        path: `${dir}/${kebab}.constants.ts`,
        content: constants(fallback),
      },
      {
        path: `${dir}/${kebab}.helpers.ts`,
        content: helpers(kebab, fallback, helper),
      },
      {
        path: `${dir}/${kebab}.helpers.test.ts`,
        content: helpersTest(kebab, fallback, helper),
      },
      {
        path: `${dir}/index.ts`,
        content: `export * from './${kebab}.constants';\nexport * from './${kebab}.helpers';\n`,
      },
    ],
    edits: [],
    notes: [],
  };
}

/** @param {string} fallback */
export function constants(fallback) {
  return `/** Shown when there is no value. */
export const ${fallback} = 'Unknown';
`;
}

/**
 * @param {string} kebab
 * @param {string} fallback
 * @param {string} helper
 */
export function helpers(kebab, fallback, helper) {
  return `import { ${fallback} } from './${kebab}.constants';

/** The trimmed value, or the fallback when it is missing or blank. */
export function ${helper}(value: string | null | undefined): string {
  return value?.trim() || ${fallback};
}
`;
}

/**
 * @param {string} kebab
 * @param {string} fallback
 * @param {string} helper
 */
export function helpersTest(kebab, fallback, helper) {
  return `import { ${fallback} } from './${kebab}.constants';
import { ${helper} } from './${kebab}.helpers';

describe('${helper}', () => {
  it('trims the value', () => {
    expect(${helper}('  hello ')).toBe('hello');
  });

  it.each([null, undefined, '', '   '])('falls back for %j', (value) => {
    expect(${helper}(value)).toBe(${fallback});
  });
});
`;
}
