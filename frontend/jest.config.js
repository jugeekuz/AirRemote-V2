const ts = require('typescript');

const { config, error } = ts.readConfigFile('./tsconfig.json', ts.sys.readFile);
if (error) {
  throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
}

// tsconfig.json `paths` is the single source of import aliases:
// 'X/*' -> '^X/(.*)$' -> '<rootDir>/<target>/$1', and exact 'X' -> '^X$'.
function toModuleNameMapper(paths) {
  const mapper = {};
  for (const [alias, targets] of Object.entries(paths)) {
    const target = targets[0].replace(/^\.\//, '');
    if (alias.endsWith('/*')) {
      mapper[`^${alias.slice(0, -2)}/(.*)$`] =
        `<rootDir>/${target.slice(0, -2)}/$1`;
    } else {
      mapper[`^${alias}$`] = `<rootDir>/${target}`;
    }
  }
  return mapper;
}

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  resolver: '<rootDir>/jest.resolver.js',
  // eslint/ holds root tooling, tested by the root Vitest unit project.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/eslint/'],
  moduleNameMapper: {
    // First, so `@ui/global.css` matches it before the `@ui/*` alias.
    '\\.css$': '<rootDir>/mocks/file.mock.ts',
    ...toModuleNameMapper(config.compilerOptions.paths),
    '\\.(png|jpe?g|gif|webp|svg|ttf|otf|woff2?|mp3|wav)$':
      '<rootDir>/mocks/file.mock.ts',
  },
  // Packages that ship untranspiled code are transformed. The optional
  // `.pnpm/<package>/node_modules/` segment makes the pattern work with
  // pnpm's isolated node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/.+?/node_modules/)?(?:(?:jest-)?react-native|@react-native|expo|@expo|@react-navigation|uniwind|tailwind-variants|react-native-reanimated|react-native-worklets|react-native-mmkv|react-native-nitro-modules|@gorhom|@airremote/contracts))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/{assets,i18n,types,ui}/**',
    '!src/ui/heroui/**',
  ],
};
