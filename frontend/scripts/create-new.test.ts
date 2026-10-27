/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The generator is a Node ESM script, which Jest's CommonJS runtime can't load,
// so every test runs it as the real CLI in a child process against a temp
// copy of the parts of `frontend/` it touches.
const CLI = path.join(__dirname, 'create-new.mjs');

type CliResult = { status: number | null; stdout: string; stderr: string };

let root: string;

function write(file: string, content: string) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file: string): boolean {
  return fs.existsSync(path.join(root, file));
}

function run(args: string[], env: Record<string, string> = {}): CliResult {
  const result = spawnSync(
    process.execPath,
    [CLI, ...args, '--root', root],
    // Stdin is not a TTY, so a missing argument fails instead of prompting.
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runOk(args: string[]): CliResult {
  const result = run(args);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  return result;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-new-'));
  write(
    'src/stores/stores.constants.ts',
    `export const STORE_PERSIST_KEY = Object.freeze({
  PREFERENCES: 'preferences-store',
} as const);
`,
  );
  fs.mkdirSync(path.join(root, 'src/modules/devices'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('create-new', () => {
  it('turns PascalCase into kebab-case files', () => {
    runOk(['component', 'DeviceCard']);

    const dir = 'src/components/device-card';
    expect(exists(`${dir}/device-card.tsx`)).toBe(true);
    expect(exists(`${dir}/device-card.test.tsx`)).toBe(true);
    expect(read(`${dir}/index.ts`)).toBe(
      "export { default } from './device-card';\n",
    );
    expect(read(`${dir}/device-card.tsx`)).toContain(
      'export default function DeviceCard(',
    );
    expect(read(`${dir}/device-card.test.tsx`)).toContain(
      "describe('DeviceCard'",
    );
  });

  it('accepts kebab-case names too', () => {
    runOk(['helper', 'date-range']);

    expect(exists('src/helpers/date-range/date-range.helpers.ts')).toBe(true);
    expect(exists('src/helpers/date-range/date-range.constants.ts')).toBe(true);
    expect(exists('src/helpers/date-range/date-range.helpers.test.ts')).toBe(
      true,
    );
    expect(read('src/helpers/date-range/index.ts')).toBe(
      "export * from './date-range.constants';\nexport * from './date-range.helpers';\n",
    );
  });

  it('puts module files inside the module', () => {
    runOk(['hook', 'PairingCode', '--module', 'devices']);

    const dir = 'src/modules/devices/hooks/use-pairing-code';
    expect(exists(`${dir}/use-pairing-code.ts`)).toBe(true);
    expect(exists(`${dir}/use-pairing-code.test.ts`)).toBe(true);
    expect(read(`${dir}/index.ts`)).toBe(
      "export * from './use-pairing-code';\n",
    );
    expect(read(`${dir}/use-pairing-code.ts`)).toContain(
      'export function usePairingCode(',
    );
    expect(exists('src/hooks')).toBe(false);
    expect(read('src/modules/devices/hooks/index.ts')).toBe(
      "export * from './use-pairing-code';\n",
    );
  });

  it('adds barrel lines without repeating them', () => {
    write(
      'src/modules/devices/hooks/index.ts',
      "export * from './use-other';\n",
    );

    runOk(['hook', 'PairingCode', '--module', 'devices']);
    fs.rmSync(path.join(root, 'src/modules/devices/hooks/use-pairing-code'), {
      recursive: true,
    });
    runOk(['hook', 'PairingCode', '--module', 'devices']);

    expect(read('src/modules/devices/hooks/index.ts')).toBe(
      "export * from './use-other';\nexport * from './use-pairing-code';\n",
    );
  });

  it('puts a global hook where @hooks finds it, without a barrel', () => {
    runOk(['hook', 'use-pairing-code']);

    expect(exists('src/hooks/use-pairing-code/use-pairing-code.ts')).toBe(true);
    expect(exists('src/hooks/index.ts')).toBe(false);
  });

  it('refuses to overwrite', () => {
    runOk(['component', 'DeviceCard']);
    const file = 'src/components/device-card/device-card.tsx';
    write(file, '// edited by hand\n');

    const result = run(['component', 'DeviceCard']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(file);
    expect(read(file)).toBe('// edited by hand\n');
  });

  it('writes nothing when it refuses', () => {
    write('src/components/device-card/index.ts', '// mine\n');

    const result = run(['component', 'DeviceCard']);

    expect(result.status).not.toBe(0);
    expect(exists('src/components/device-card/device-card.tsx')).toBe(false);
  });

  it('fails for a module that does not exist', () => {
    const result = run(['component', 'DeviceCard', '--module', 'ghost']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Module "ghost" does not exist');
    expect(exists('src/modules/ghost')).toBe(false);
  });

  it('prints the failure in red', () => {
    const result = run(['component', 'DeviceCard', '--module', 'ghost'], {
      NO_COLOR: '',
      FORCE_COLOR: '1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('\u001b[31m');
  });

  it.each(['deviceCard', 'device_card', 'Device Card', '../escape', '1abc'])(
    'refuses the name %j',
    (name) => {
      const result = run(['component', name]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('PascalCase');
    },
  );

  it('fails when a name is missing and nobody can be asked', () => {
    const result = run(['component']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('name');
  });

  it('refuses an unknown kind', () => {
    const result = run(['widget', 'Thing']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('widget');
  });

  it('refuses options a kind does not take', () => {
    expect(run(['domain', 'scratch', '--module', 'devices']).status).not.toBe(
      0,
    );
    expect(run(['component', 'Thing', '--persisted']).status).not.toBe(0);
    expect(run(['module', 'devices']).stderr).toContain('already exists');
  });

  it('adds a persist key for a persisted store', () => {
    runOk(['store', 'Session', '--persisted']);

    expect(read('src/stores/stores.constants.ts')).toBe(
      `export const STORE_PERSIST_KEY = Object.freeze({
  PREFERENCES: 'preferences-store',
  SESSION: 'session-store',
} as const);
`,
    );
    const store = read('src/stores/session/session.store.ts');
    expect(store).toContain('STORE_PERSIST_KEY.SESSION');
    expect(store).toContain('version: 1');
    expect(store).toContain('export const sessionStore');
    expect(read('src/stores/session/index.ts')).toBe(
      "export * from './session.store';\n",
    );
  });

  it('keeps a module store persist key apart from a global one', () => {
    runOk(['store', 'Pairing', '--module', 'devices', '--persisted']);

    expect(read('src/stores/stores.constants.ts')).toContain(
      "DEVICES_PAIRING: 'devices-pairing-store',",
    );
    expect(
      read('src/modules/devices/stores/pairing/pairing.store.ts'),
    ).toContain('STORE_PERSIST_KEY.DEVICES_PAIRING');
  });

  it('adds no persist key for a store that is not persisted', () => {
    const before = read('src/stores/stores.constants.ts');

    runOk(['store', 'Session']);

    expect(read('src/stores/stores.constants.ts')).toBe(before);
    expect(read('src/stores/session/session.store.ts')).not.toContain(
      'STORE_PERSIST_KEY',
    );
  });

  it('refuses a persisted store whose key is taken, writing nothing', () => {
    const result = run(['store', 'Preferences', '--persisted']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PREFERENCES');
    expect(exists('src/stores/preferences')).toBe(false);
  });

  it('prints the resources.ts lines for a new module', () => {
    const { stdout } = runOk(['module', 'pairing-flow']);

    expect(stdout).toContain(
      "import enPairingFlow from '@modules/pairing-flow/i18n/locales/en/pairing-flow.json';",
    );
    expect(stdout).toContain("'pairing-flow': enPairingFlow,");
    expect(stdout).toContain('src/i18n/resources.ts');
    expect(stdout).toContain('PairingFlowNavigator');
  });

  it('creates the module skeleton', () => {
    runOk(['module', 'pairing']);

    const base = 'src/modules/pairing';
    for (const folder of [
      'components',
      'hooks',
      'contexts',
      'stores',
      'helpers',
      'utils',
      'constants',
    ]) {
      expect(exists(`${base}/${folder}/.gitkeep`)).toBe(true);
    }
    expect(exists(`${base}/navigation/pairing-navigator.tsx`)).toBe(true);
  });

  it('gives a new module a starter screen that its navigator renders', () => {
    const { stdout } = runOk(['module', 'pairing-flow']);

    const base = 'src/modules/pairing-flow';
    const screens = `${base}/screens/pairing-flow-screen`;
    expect(exists(`${screens}/pairing-flow-screen.tsx`)).toBe(true);
    expect(exists(`${screens}/pairing-flow-screen.test.tsx`)).toBe(true);
    expect(read(`${screens}/index.ts`)).toBe(
      "export { default } from './pairing-flow-screen';\n",
    );
    expect(
      JSON.parse(read(`${base}/i18n/locales/en/pairing-flow.json`)),
    ).toEqual({ 'pairing-flow': { title: 'Pairing flow' } });

    const navigator = read(`${base}/navigation/pairing-flow-navigator.tsx`);
    expect(navigator).toContain(
      "import PairingFlowScreen from '@modules/pairing-flow/screens/pairing-flow-screen';",
    );
    expect(navigator).toContain('<Stack.Navigator');
    expect(navigator).toContain('component={PairingFlowScreen}');
    expect(navigator).toContain("useTranslation('pairing-flow')");
    expect(navigator).not.toContain(
      '<Stack.Navigator screenOptions={{ headerShown: false }} />',
    );

    expect(stdout).toContain(
      'export type PairingFlowStackParamList = { PairingFlow: undefined };',
    );
  });

  it('separates the lines to add by hand from the advice', () => {
    const { stdout } = runOk(['module', 'pairing']);

    const [required = '', advice = ''] = stdout.split('Next:');
    expect(required).toContain('Add by hand:');
    expect(required).toContain('src/i18n/resources.ts');
    expect(required).not.toContain('create-new screen');
    expect(advice).toContain('create-new screen <Name> --module pairing');
  });

  it('suggests formatting only the files prettier can format', () => {
    const { stdout } = runOk(['module', 'pairing']);

    const command = stdout
      .split('\n')
      .find((line) => line.includes('prettier --write'));
    expect(command).toContain('pairing-screen.tsx');
    expect(command).toContain('pairing.json');
    expect(command).not.toContain('.gitkeep');
  });

  it('gives a screen its title in the module namespace', () => {
    runOk(['screen', 'PairingCode', '--module', 'devices']);

    const dir = 'src/modules/devices/screens/pairing-code-screen';
    expect(read(`${dir}/pairing-code-screen.tsx`)).toContain(
      "useTranslation('devices')",
    );
    expect(read(`${dir}/pairing-code-screen.tsx`)).toContain(
      'export default function PairingCodeScreen(',
    );
    expect(exists(`${dir}/pairing-code-screen.test.tsx`)).toBe(true);
    expect(read(`${dir}/index.ts`)).toBe(
      "export { default } from './pairing-code-screen';\n",
    );
    expect(
      JSON.parse(read('src/modules/devices/i18n/locales/en/devices.json')),
    ).toEqual({ 'pairing-code': { title: 'Pairing code' } });
  });

  it('gives a global screen its title in the screens namespace', () => {
    write(
      'src/i18n/locales/en/screens.json',
      JSON.stringify({ login: 'Sign in' }, null, 2) + '\n',
    );

    const { stdout } = runOk(['screen', 'Settings']);

    expect(exists('src/screens/settings-screen/settings-screen.tsx')).toBe(
      true,
    );
    expect(JSON.parse(read('src/i18n/locales/en/screens.json'))).toEqual({
      login: 'Sign in',
      settings: { title: 'Settings' },
    });
    expect(stdout).toContain('SettingsScreen');
    expect(stdout).toContain('navigation.types.ts');
  });

  it('generates a domain: api, queries and mutations', () => {
    const { stdout } = runOk(['domain', 'scratch']);

    for (const file of [
      'src/api/scratch/scratch.api.ts',
      'src/api/scratch/scratch.api.test.ts',
      'src/api/scratch/index.ts',
      'src/queries/scratch/scratch.queries.ts',
      'src/queries/scratch/scratch.queries.test.tsx',
      'src/queries/scratch/scratch.mutations.ts',
      'src/queries/scratch/scratch.mutations.test.tsx',
      'src/queries/scratch/index.ts',
    ]) {
      expect(exists(file)).toBe(true);
    }
    expect(read('src/queries/scratch/scratch.queries.ts')).toContain(
      'export const scratchKeys',
    );
    expect(stdout).toContain('@airremote/contracts');
  });

  it('uses the domain name as given for its path', () => {
    runOk(['domain', 'devices']);

    const api = read('src/api/devices/devices.api.ts');
    expect(api).toContain("httpClient.get('/devices',");
    expect(api).not.toContain('/deviceses');
    expect(api).toContain('export const devicesApi');
  });

  it('groups the query options in xQueries next to xKeys', () => {
    runOk(['domain', 'device-commands']);

    const queries = read(
      'src/queries/device-commands/device-commands.queries.ts',
    );
    expect(queries).toContain('export const deviceCommandsKeys = {');
    expect(queries).toContain('export const deviceCommandsQueries = {');
    expect(queries).toContain('list: () =>');
    expect(queries).toContain('detail: (id: string) =>');
    expect(queries).not.toContain('QueryOptions =');
    expect(read('src/queries/device-commands/index.ts')).toContain(
      "export { deviceCommandsKeys, deviceCommandsQueries } from './device-commands.queries';",
    );
    expect(
      read('src/queries/device-commands/device-commands.queries.test.tsx'),
    ).toContain('useQuery(deviceCommandsQueries.detail(');
    expect(read('src/api/device-commands/device-commands.api.ts')).toContain(
      "'/device-commands'",
    );
  });

  it('tells a global store to reset in authStore.signOut', () => {
    const { stdout } = runOk(['store', 'Session']);

    expect(stdout).toContain('sessionStore.reset() in authStore.signOut');
  });

  it('tells a module store to reset from the module, not authStore.signOut', () => {
    const { stdout } = runOk(['store', 'Pairing', '--module', 'devices']);

    expect(stdout).not.toContain('reset() in authStore.signOut');
    expect(stdout).toContain(
      'pairingStore.reset() in the cleanup of an effect',
    );
    expect(stdout).toContain('src/stores');
  });

  it('shows AirRemote names in its usage', () => {
    const { stdout, status } = run(['--help']);

    expect(status).toBe(0);
    expect(stdout).toContain('DeviceCard, device-card');
    expect(stdout).not.toContain('Product');
  });

  it('lists what it created', () => {
    const { stdout } = runOk(['component', 'DeviceCard']);

    expect(stdout).toContain('src/components/device-card/device-card.tsx');
  });

  it('exports generate for other tools', () => {
    const script = `
      const { generate } = await import(${JSON.stringify(CLI)});
      const result = generate({ kind: 'helper', name: 'Dates', root: ${JSON.stringify(root)} });
      console.log(JSON.stringify(result));
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    const { files, notes } = JSON.parse(result.stdout) as {
      files: string[];
      notes: string[];
    };
    expect(files).toContain('src/helpers/dates/dates.helpers.ts');
    expect(notes).toEqual([]);
  });
});
