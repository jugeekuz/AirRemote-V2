import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

const BOUNDARY_RULES = new Set([
  'no-restricted-imports',
  'no-restricted-properties',
]);

/** Lints `code` as if it lived at `frontend/src/<file>` and returns the boundary errors. */
async function boundaryErrors(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repoRoot, 'frontend/src', file),
  });
  if (!result) {
    throw new Error(`ESLint returned no result for ${file}`);
  }
  return result.messages
    .filter(
      (message) =>
        message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
    )
    .map((message) => message.message);
}

const importing = (source: string) =>
  `import { value } from '${source}';\nexport { value };\n`;

describe('layer boundaries', () => {
  it('stops helpers from importing the api layer', async () => {
    const errors = await boundaryErrors(
      'helpers/auth/auth.helpers.ts',
      importing('@api/http-client'),
    );

    expect(errors).toEqual([
      expect.stringContaining('"helpers" layer must not import from "api"'),
    ]);
  });

  it('stops stores from importing queries', async () => {
    const errors = await boundaryErrors(
      'stores/auth/auth.store.ts',
      importing('@queries/auth'),
    );

    expect(errors).toEqual([
      expect.stringContaining('"stores" layer must not import from "queries"'),
    ]);
  });

  it('stops queries from importing stores', async () => {
    const errors = await boundaryErrors(
      'queries/auth/auth.mutations.ts',
      importing('@stores/auth'),
    );

    expect(errors).toEqual([
      expect.stringContaining('"queries" layer must not import from "stores"'),
    ]);
  });

  it('stops components from importing the api layer', async () => {
    const errors = await boundaryErrors(
      'components/x/x.tsx',
      importing('@api/auth'),
    );

    expect(errors).toEqual([
      expect.stringContaining('"components" layer must not import from "api"'),
    ]);
  });

  it('stops a module from importing another module', async () => {
    const errors = await boundaryErrors(
      'modules/auth/screens/login-screen/login-screen.tsx',
      importing('@modules/home/navigation/home-navigator'),
    );

    // It also imports another layer the screens layer may not use (navigation).
    expect(errors).toContainEqual(expect.stringContaining('Module "auth"'));
  });

  it('lets a module import its own code', async () => {
    const errors = await boundaryErrors(
      'modules/auth/screens/login-screen/login-screen.tsx',
      importing('@modules/auth/components/login-form'),
    );

    expect(errors).toEqual([]);
  });

  it('stops shared layers from importing modules', async () => {
    const errors = await boundaryErrors(
      'hooks/use-auth/use-auth.ts',
      importing('@modules/auth/hooks/use-login'),
    );

    expect(errors).toEqual([
      expect.stringContaining(
        'Shared layers must not depend on feature modules',
      ),
    ]);
  });

  it('forbids parent-relative imports', async () => {
    const errors = await boundaryErrors(
      'utils/platform/platform.utils.ts',
      importing('../logger'),
    );

    expect(errors).toEqual([
      expect.stringContaining('instead of a parent-relative path'),
    ]);
  });

  it('lets only src/api import axios', async () => {
    expect(
      await boundaryErrors('hooks/use-x/use-x.ts', importing('axios')),
    ).toEqual([expect.stringContaining('Only src/api imports axios')]);
    expect(
      await boundaryErrors('api/http-client.ts', importing('axios')),
    ).toEqual([]);
  });

  it('lets src/types/axios.d.ts import axios to augment it', async () => {
    const errors = await boundaryErrors(
      'types/axios.d.ts',
      "import 'axios';\n",
    );

    expect(errors).toEqual([]);
  });

  it('lets only src/adapters import MMKV', async () => {
    expect(
      await boundaryErrors(
        'stores/x/x.store.ts',
        importing('react-native-mmkv'),
      ),
    ).toEqual([
      expect.stringContaining('Only src/adapters imports react-native-mmkv'),
    ]);
    expect(
      await boundaryErrors(
        'adapters/storage/storage.adapter.ts',
        importing('react-native-mmkv'),
      ),
    ).toEqual([]);
  });

  it('lets app code reach the UI kit only through @ui', async () => {
    expect(
      await boundaryErrors(
        'modules/home/screens/home-screen/home-screen.tsx',
        importing('@ui/heroui/components/button'),
      ),
    ).toEqual([expect.stringContaining('Import the UI kit from @ui')]);
    expect(
      await boundaryErrors(
        'modules/home/screens/home-screen/home-screen.tsx',
        importing('@ui'),
      ),
    ).toEqual([]);
  });

  it("lets only src/ui import the kit's styling packages", async () => {
    expect(
      await boundaryErrors('hooks/use-x/use-x.ts', importing('uniwind')),
    ).toEqual([expect.stringContaining('Only src/ui imports')]);
    expect(
      await boundaryErrors('ui/toast/toast.ts', importing('uniwind')),
    ).toEqual([]);
  });

  it('lets only src/ui import expo-image', async () => {
    expect(
      await boundaryErrors(
        'components/top-toolbar/top-toolbar.tsx',
        importing('expo-image'),
      ),
    ).toEqual([expect.stringContaining('Only src/ui imports expo-image')]);
    expect(
      await boundaryErrors('ui/image/image.tsx', importing('expo-image')),
    ).toEqual([]);
  });

  it('lets only src/ui import expo-camera', async () => {
    expect(
      await boundaryErrors(
        'modules/devices/components/add-device-dialog/add-device-dialog.tsx',
        importing('expo-camera'),
      ),
    ).toEqual([expect.stringContaining('Only src/ui imports expo-camera')]);
    expect(
      await boundaryErrors(
        'ui/qr-scanner/qr-scanner.tsx',
        importing('expo-camera'),
      ),
    ).toEqual([]);
  });

  it('lets only src/ui import expo-linear-gradient', async () => {
    expect(
      await boundaryErrors(
        'modules/auth/components/submit-button/submit-button.tsx',
        importing('expo-linear-gradient'),
      ),
    ).toEqual([
      expect.stringContaining('Only src/ui imports expo-linear-gradient'),
    ]);
    expect(
      await boundaryErrors(
        'ui/linear-gradient/linear-gradient.tsx',
        importing('expo-linear-gradient'),
      ),
    ).toEqual([]);
  });

  it('lets only src/config read process.env', async () => {
    const code = 'export const x = process.env.X;\n';

    expect(await boundaryErrors('hooks/use-x/use-x.ts', code)).toEqual([
      expect.stringContaining('Read configuration through src/config.'),
    ]);
    expect(await boundaryErrors('config/env/env.ts', code)).toEqual([]);
  });

  it('lets screens use stores and queries', async () => {
    const code =
      "import { a } from '@stores/auth';\nimport { b } from '@queries/auth';\nexport { a, b };\n";

    expect(
      await boundaryErrors('screens/loading-screen/loading-screen.tsx', code),
    ).toEqual([]);
  });

  it('does not apply layer rules to test files', async () => {
    const errors = await boundaryErrors(
      'helpers/auth/auth.helpers.test.ts',
      importing('@mocks/x'),
    );

    expect(errors).toEqual([]);
  });

  it('lets src/navigation import module navigators', async () => {
    const errors = await boundaryErrors(
      'navigation/root-navigator.tsx',
      importing('@modules/auth/navigation/auth-navigator'),
    );

    expect(errors).toEqual([]);
  });

  it('lets src/app import the stylesheet through @ui/...', async () => {
    expect(
      await boundaryErrors('app/app.tsx', "import '@ui/global.css';\n"),
    ).toEqual([]);
  });

  it('still forbids parent-relative imports in test files', async () => {
    const errors = await boundaryErrors(
      'helpers/auth/auth.helpers.test.ts',
      importing('../errors'),
    );

    expect(errors).toEqual([
      expect.stringContaining('instead of a parent-relative path'),
    ]);
  });

  it('forbids importing the parent folder itself', async () => {
    for (const source of ['..', '../']) {
      expect(
        await boundaryErrors(
          'utils/platform/platform.utils.ts',
          importing(source),
        ),
      ).toEqual([expect.stringContaining('instead of a parent-relative path')]);
    }
  });

  it('stops src/ui and src/types from importing modules', async () => {
    expect(
      await boundaryErrors('ui/x/x.tsx', importing('@modules/auth/screens/x')),
    ).toEqual([
      expect.stringContaining(
        'Shared layers must not depend on feature modules',
      ),
    ]);
    expect(
      await boundaryErrors('types/x.types.ts', importing('@modules/auth/x')),
    ).toEqual([
      expect.stringContaining(
        'Shared layers must not depend on feature modules',
      ),
    ]);
  });

  it("lets src/i18n import only the modules' translations", async () => {
    expect(
      await boundaryErrors(
        'i18n/resources.ts',
        importing('@modules/auth/i18n/locales/en/auth.json'),
      ),
    ).toEqual([]);
    expect(
      await boundaryErrors(
        'i18n/resources.ts',
        importing('@modules/auth/screens/x'),
      ),
    ).toEqual([expect.stringContaining("only a module's i18n folder")]);
  });

  it('applies the cross-module rule outside layer folders too', async () => {
    const errors = await boundaryErrors(
      'modules/auth/index.ts',
      importing('@modules/home/screens/home-screen'),
    );

    expect(errors).toEqual([expect.stringContaining('Module "auth"')]);
  });

  it('stops src/app from importing the styling packages', async () => {
    expect(await boundaryErrors('app/app.tsx', importing('uniwind'))).toEqual([
      expect.stringContaining('Only src/ui imports'),
    ]);
  });

  it('ends every boundary message with a pointer to the architecture doc', async () => {
    const cases: [file: string, source: string][] = [
      ['helpers/auth/auth.helpers.ts', '@api/http-client'],
      ['hooks/use-x/use-x.ts', 'axios'],
      [
        'modules/auth/screens/login-screen/login-screen.tsx',
        '@modules/home/components/x',
      ],
      ['hooks/use-x/use-x.ts', '@modules/auth/hooks/use-login'],
      ['utils/platform/platform.utils.ts', '../logger'],
      ['i18n/resources.ts', '@modules/auth/screens/x'],
    ];

    for (const [file, source] of cases) {
      expect(await boundaryErrors(file, importing(source))).toEqual([
        expect.stringMatching(
          /See frontend\/ARCHITECTURE\.md, 'Layers and import rules'\.$/,
        ),
      ]);
    }
  });
});
