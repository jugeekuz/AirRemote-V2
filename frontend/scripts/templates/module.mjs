// @ts-check
import * as screen from './screen.mjs';
import { screenNames } from './screen.mjs';
import { GeneratorError } from './shared.mjs';

/** The folders of a module that start empty. */
const EMPTY_FOLDERS = [
  'components',
  'hooks',
  'contexts',
  'stores',
  'helpers',
  'utils',
  'constants',
];

/**
 * The module comes with one screen, named after it: a navigator needs a
 * screen to render. More are added with `create-new screen`.
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  if (ctx.module !== undefined) {
    throw new GeneratorError('A module cannot be created inside a module.');
  }
  const { kebab, pascal } = ctx.names;
  const base = `src/modules/${kebab}`;
  const importName = `en${pascal}`;
  const namespaceKey = /-/.test(kebab) ? `'${kebab}'` : kebab;
  const starter = screenNames(kebab);
  const starterPlan = screen.plan({ ...ctx, module: kebab });

  return {
    files: [
      ...EMPTY_FOLDERS.map((folder) => ({
        path: `${base}/${folder}/.gitkeep`,
        content: '',
      })),
      ...starterPlan.files,
      {
        path: `${base}/navigation/${kebab}-navigator.tsx`,
        content: navigator(pascal, kebab, starter),
      },
      { path: `${base}/i18n/locales/en/${kebab}.json`, content: '{}\n' },
    ],
    // Adds the starter screen's title to the JSON created above.
    edits: starterPlan.edits,
    notes: [
      'Register its translations in src/i18n/resources.ts:',
      `  import ${importName} from '@modules/${kebab}/i18n/locales/en/${kebab}.json';`,
      `  and inside resources.en:  ${namespaceKey}: ${importName},`,
      'Add its stack to src/types/navigation.types.ts, export the type from src/types/index.ts, and nest it in RootStackParamList:',
      `  export type ${pascal}StackParamList = { ${starter.pascal}: undefined };`,
      `  ${pascal}: NavigatorScreenParams<${pascal}StackParamList>;`,
      'Mount its navigator in src/navigation/root-navigator.tsx, in the branch it belongs to:',
      `  import ${pascal}Navigator from '@modules/${kebab}/navigation/${kebab}-navigator';`,
      `  <Stack.Screen name="${pascal}" component={${pascal}Navigator} />`,
    ],
    hints: [
      `Add more screens with: pnpm --filter @airremote/frontend create-new screen <Name> --module ${kebab}`,
      'To open it from a URL, add it to src/navigation/linking.ts.',
    ],
  };
}

/**
 * @param {string} pascal
 * @param {string} kebab
 * @param {ReturnType<typeof screenNames>} starter
 */
export function navigator(pascal, kebab, starter) {
  return `import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { ${pascal}StackParamList } from '@app-types';
import ${starter.component} from '@modules/${kebab}/screens/${starter.file}';

const Stack = createNativeStackNavigator<${pascal}StackParamList>();

export default function ${pascal}Navigator() {
  const { t } = useTranslation('${kebab}');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="${starter.pascal}"
        component={${starter.component}}
        options={{ title: t('${starter.base}.title') }}
      />
    </Stack.Navigator>
  );
}
`;
}
