// @ts-check
import { addScreenTitle, layerAlias, layerDir, toNames } from './shared.mjs';

/**
 * A screen is `<name>-screen`; a trailing `-screen` in the name is not repeated.
 * Its title lives in the module's namespace (or `screens` for a global one)
 * under `<name>.title`.
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  const { base, pascal, words, file, component } = screenNames(ctx.names.kebab);
  const namespace = ctx.module ?? 'screens';
  const dir = `${layerDir(ctx, 'screens')}/${file}`;
  const i18nFile = ctx.module
    ? `src/modules/${ctx.module}/i18n/locales/en/${ctx.module}.json`
    : 'src/i18n/locales/en/screens.json';
  const alias = layerAlias(ctx, 'screens', file);
  const navigator = ctx.module
    ? `src/modules/${ctx.module}/navigation/${ctx.module}-navigator.tsx`
    : 'src/navigation/root-navigator.tsx (or the navigator of the stack it belongs to)';

  return {
    files: [
      {
        path: `${dir}/${file}.tsx`,
        content: screen(component, namespace, base),
      },
      {
        path: `${dir}/${file}.test.tsx`,
        content: screenTest(component, file, base),
      },
      {
        path: `${dir}/index.ts`,
        content: `export { default } from './${file}';\n`,
      },
    ],
    edits: [addScreenTitle(i18nFile, base, words)],
    notes: [
      `Register the screen in ${navigator}:`,
      `  import ${component} from '${alias}';`,
      `  <Stack.Screen name="${pascal}" component={${component}} options={{ title: t('${base}.title') }} />`,
      `  (t comes from useTranslation('${namespace}'))`,
      `Add the route to that stack's param list in src/types/navigation.types.ts:`,
      `  ${pascal}: undefined;`,
    ],
    hints: ['To open it from a URL, add it to src/navigation/linking.ts.'],
  };
}

/**
 * The names a screen goes by.
 * @param {string} kebab the name given, in kebab-case
 */
export function screenNames(kebab) {
  const base = kebab.replace(/(?<=.)-screen$/, '');
  const { pascal, words } = toNames(base, 'screen name');
  return {
    base,
    pascal,
    words,
    file: `${base}-screen`,
    component: `${pascal}Screen`,
  };
}

/**
 * @param {string} component
 * @param {string} namespace
 * @param {string} base
 */
export function screen(component, namespace, base) {
  return `import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@ui';

/** The ${component} screen. */
export default function ${component}() {
  const { t } = useTranslation('${namespace}');

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text.Heading type="h3" align="center">
        {t('${base}.title')}
      </Text.Heading>
    </View>
  );
}
`;
}

/**
 * @param {string} component
 * @param {string} file
 * @param {string} base
 */
export function screenTest(component, file, base) {
  return `import { renderWithProviders, screen } from '@utils/tests';

import ${component} from './${file}';

describe('${component}', () => {
  it('shows its title', async () => {
    await renderWithProviders(<${component} />);

    expect(screen.getByText('${base}.title')).toBeOnTheScreen();
  });
});
`;
}
