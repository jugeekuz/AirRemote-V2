// @ts-check
import { layerDir } from './shared.mjs';

/**
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  const { kebab, pascal } = ctx.names;
  const dir = `${layerDir(ctx, 'components')}/${kebab}`;
  return {
    files: [
      { path: `${dir}/${kebab}.tsx`, content: component(pascal) },
      {
        path: `${dir}/${kebab}.test.tsx`,
        content: componentTest(pascal, kebab),
      },
      {
        path: `${dir}/index.ts`,
        content: `export { default } from './${kebab}';\n`,
      },
    ],
    edits: [],
    notes: [],
  };
}

/** @param {string} pascal */
export function component(pascal) {
  return `import { View } from 'react-native';

import { Text } from '@ui';

type ${pascal}Props = {
  /** The text shown. */
  label: string;
};

/** Shows its label. */
export default function ${pascal}({ label }: ${pascal}Props) {
  return (
    <View className="gap-2 p-4">
      <Text.Paragraph>{label}</Text.Paragraph>
    </View>
  );
}
`;
}

/**
 * @param {string} pascal
 * @param {string} kebab
 */
export function componentTest(pascal, kebab) {
  return `import { renderWithProviders, screen } from '@utils/tests';

import ${pascal} from './${kebab}';

describe('${pascal}', () => {
  it('shows its label', async () => {
    await renderWithProviders(<${pascal} label="Hello" />);

    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });
});
`;
}
