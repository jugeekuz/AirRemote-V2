// @ts-check
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
  'screens',
];

/**
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

  return {
    files: [
      ...EMPTY_FOLDERS.map((folder) => ({
        path: `${base}/${folder}/.gitkeep`,
        content: '',
      })),
      {
        path: `${base}/navigation/${kebab}-navigator.tsx`,
        content: navigator(pascal, kebab),
      },
      { path: `${base}/i18n/locales/en/${kebab}.json`, content: '{}\n' },
    ],
    edits: [],
    notes: [
      'Register its translations in src/i18n/resources.ts:',
      `  import ${importName} from '@modules/${kebab}/i18n/locales/en/${kebab}.json';`,
      `  and inside resources.en:  ${namespaceKey}: ${importName},`,
      'Add its stack to src/types/navigation.types.ts, export the type from src/types/index.ts, and nest it in RootStackParamList:',
      `  export type ${pascal}StackParamList = Record<string, undefined>;`,
      `  ${pascal}: NavigatorScreenParams<${pascal}StackParamList>;`,
      '  (list its routes in the param list as you add screens)',
      'Mount its navigator in src/navigation/root-navigator.tsx, in the branch it belongs to:',
      `  import ${pascal}Navigator from '@modules/${kebab}/navigation/${kebab}-navigator';`,
      `  <Stack.Screen name="${pascal}" component={${pascal}Navigator} />`,
      `Then add its screens with: pnpm --filter @airremote/frontend create-new screen <Name> --module ${kebab}`,
    ],
  };
}

/**
 * @param {string} pascal
 * @param {string} kebab
 */
export function navigator(pascal, kebab) {
  return `import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { ${pascal}StackParamList } from '@app-types';

const Stack = createNativeStackNavigator<${pascal}StackParamList>();

/** Its screens are added with \`create-new screen <Name> --module ${kebab}\`. */
export default function ${pascal}Navigator() {
  return <Stack.Navigator screenOptions={{ headerShown: false }} />;
}
`;
}
