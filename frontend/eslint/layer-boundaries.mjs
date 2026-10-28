// @ts-check
/**
 * Generates the ESLint configs that enforce the frontend's import rules
 * (frontend/ARCHITECTURE.md, "Layers and import rules"):
 * - each layer may not import the layers listed in FORBIDDEN_IMPORTS
 * - modules may not import other modules
 * - shared (global) layers may not import modules
 * - no parent-relative imports
 * - some packages may only be imported from one place (PACKAGE_RULES)
 *
 * Flat config replaces a rule's options when several configs match a file,
 * so every config below carries the complete `no-restricted-imports` pattern
 * list for its files. They are ordered from general to specific: the last
 * one that matches a file wins.
 */
import fs from 'node:fs';
import path from 'node:path';

/** @typedef {import('eslint').Linter.Config} Config */
/** @typedef {{ group: string[], message: string } | { regex: string, message: string }} Pattern */

const SRC = 'frontend/src';
const MODULES_DIR = path.join(import.meta.dirname, '..', 'src', 'modules');
const SEE_DOCS = "See frontend/ARCHITECTURE.md, 'Layers and import rules'.";

/** @type {Record<string, string>} */
const GLOBAL_LAYER_ALIAS = {
  navigation: '@navigation',
  screens: '@screens',
  components: '@components',
  hooks: '@hooks',
  contexts: '@contexts',
  stores: '@stores',
  queries: '@queries',
  helpers: '@helpers',
  api: '@api',
  adapters: '@adapters',
  utils: '@utils',
  config: '@config',
};

const PRESENTATION_LAYERS = [
  'navigation',
  'screens',
  'components',
  'hooks',
  'contexts',
];

/** layer → layers it must NOT import. `ui` is not a layer, only a target. */
/** @type {Record<string, string[]>} */
const FORBIDDEN_IMPORTS = {
  screens: ['navigation', 'api'],
  components: ['navigation', 'screens', 'api'],
  hooks: ['navigation', 'screens', 'components', 'api'],
  contexts: ['navigation', 'screens', 'components', 'hooks', 'api'],
  stores: [...PRESENTATION_LAYERS, 'queries', 'api', 'ui'],
  queries: [...PRESENTATION_LAYERS, 'stores', 'adapters', 'ui'],
  helpers: [
    ...PRESENTATION_LAYERS,
    'stores',
    'queries',
    'api',
    'adapters',
    'ui',
  ],
  constants: [
    ...PRESENTATION_LAYERS,
    'stores',
    'queries',
    'helpers',
    'api',
    'adapters',
    'utils',
    'ui',
  ],
  api: [
    ...PRESENTATION_LAYERS,
    'stores',
    'queries',
    'helpers',
    'adapters',
    'ui',
  ],
  adapters: [
    ...PRESENTATION_LAYERS,
    'stores',
    'queries',
    'helpers',
    'api',
    'ui',
  ],
  utils: [
    ...PRESENTATION_LAYERS,
    'stores',
    'queries',
    'helpers',
    'api',
    'adapters',
    'ui',
  ],
  config: [
    ...PRESENTATION_LAYERS,
    'stores',
    'queries',
    'helpers',
    'api',
    'adapters',
    'utils',
    'ui',
  ],
};

const LAYERS = Object.keys(FORBIDDEN_IMPORTS);

/**
 * Packages only some folders may import. `allowedIn` is relative to
 * `frontend/src`: a folder (ending in `/`) or a single file.
 * @type {{ group: string[], message: string, allowedIn: string[], coveredByForbidden?: string }[]}
 */
const PACKAGE_RULES = [
  {
    group: ['axios', 'axios/**'],
    // axios.d.ts augments axios's types, which needs the import.
    allowedIn: ['api/', 'types/axios.d.ts'],
    message: `Only src/api imports axios. Call the API layer instead. ${SEE_DOCS}`,
  },
  {
    group: ['react-native-mmkv', 'react-native-mmkv/**'],
    allowedIn: ['adapters/'],
    message: `Only src/adapters imports react-native-mmkv. Use the storage adapter instead. ${SEE_DOCS}`,
  },
  {
    group: ['@ui/**'],
    allowedIn: ['ui/', 'app/'],
    // Layers that may not import @ui at all already report these imports.
    coveredByForbidden: 'ui',
    message: `Import the UI kit from @ui; only src/ui and src/app use @ui/... paths. ${SEE_DOCS}`,
  },
  {
    group: [
      'uniwind',
      'uniwind/**',
      'tailwind-variants',
      'tailwind-variants/**',
      'tailwind-merge',
      'tailwind-merge/**',
    ],
    allowedIn: ['ui/'],
    message: `Only src/ui imports uniwind, tailwind-variants and tailwind-merge. Use what @ui exports. ${SEE_DOCS}`,
  },
  {
    group: ['expo-image', 'expo-image/**'],
    allowedIn: ['ui/'],
    message: `Only src/ui imports expo-image. Use Image from @ui. ${SEE_DOCS}`,
  },
];

const TEST_SUPPORT_FILES = [
  `${SRC}/**/*.test.ts`,
  `${SRC}/**/*.test.tsx`,
  `${SRC}/utils/tests/**`,
];

/** @type {Pattern} */
export const NO_PARENT_RELATIVE_IMPORTS = {
  // Any `..` segment: `..`, `../`, `../x`, `./../x`.
  regex: '(^|/)\\.\\.(/|$)',
  message: `Import through a path alias (e.g. @hooks/...) instead of a parent-relative path. ${SEE_DOCS}`,
};

/** @type {Pattern} */
const NO_MODULE_IMPORTS_FROM_SHARED_LAYERS = {
  group: ['@modules', '@modules/**'],
  message: `Shared layers must not depend on feature modules. Move the code into a shared layer instead. ${SEE_DOCS}`,
};

/** @type {Pattern} */
const NO_MODULE_IMPORTS_BUT_TRANSLATIONS = {
  regex: '^@modules(?!/[^/]+/i18n/)(/|$)',
  message: `src/i18n may import only a module's i18n folder (@modules/<name>/i18n/...). ${SEE_DOCS}`,
};

/**
 * Shared folders outside the layer table, and the module rule each gets.
 * src/navigation and src/app (the composition root) may import modules.
 * @type {Record<string, Pattern[]>}
 */
const NON_LAYER_FOLDERS = {
  'app/': [],
  'ui/': [NO_MODULE_IMPORTS_FROM_SHARED_LAYERS],
  'types/': [NO_MODULE_IMPORTS_FROM_SHARED_LAYERS],
  'i18n/': [NO_MODULE_IMPORTS_BUT_TRANSLATIONS],
};

/** Read at lint time, so new modules are picked up without editing this file. */
function getModuleNames() {
  if (!fs.existsSync(MODULES_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** @param {string} target a layer, or `ui` */
function getTargetImportPatterns(target) {
  if (target === 'ui') {
    return ['@ui', '@ui/**'];
  }
  const patterns = [`@modules/*/${target}`, `@modules/*/${target}/**`];
  const alias = GLOBAL_LAYER_ALIAS[target];
  if (alias) {
    patterns.push(alias, `${alias}/**`);
  }
  return patterns;
}

/**
 * @param {string} layer
 * @returns {Pattern[]}
 */
function getForbiddenLayerPatterns(layer) {
  return (FORBIDDEN_IMPORTS[layer] ?? []).map((target) => ({
    group: getTargetImportPatterns(target),
    message: `The "${layer}" layer must not import from "${target}". ${SEE_DOCS}`,
  }));
}

/**
 * @param {string} moduleName
 * @returns {Pattern}
 */
function getCrossModulePattern(moduleName) {
  return {
    group: [
      '@modules/*',
      '@modules/*/**',
      `!@modules/${moduleName}`,
      `!@modules/${moduleName}/**`,
    ],
    message: `Module "${moduleName}" must not import from other modules. Promote shared code to a global layer. ${SEE_DOCS}`,
  };
}

/**
 * The package rules for files at `location` (relative to `frontend/src`).
 * @param {string} location
 * @param {string | undefined} layer
 * @returns {Pattern[]}
 */
function getPackagePatterns(location, layer) {
  const forbidden = layer ? (FORBIDDEN_IMPORTS[layer] ?? []) : [];
  return PACKAGE_RULES.filter(
    (rule) =>
      !rule.allowedIn.some((allowed) => location.startsWith(allowed)) &&
      !(rule.coveredByForbidden && forbidden.includes(rule.coveredByForbidden)),
  ).map(({ group, message }) => ({ group, message }));
}

/**
 * The module rule for a location outside the layer table.
 * @param {string} location
 * @returns {Pattern[]}
 */
function getNonLayerModulePatterns(location) {
  const folder = Object.keys(NON_LAYER_FOLDERS).find((key) =>
    location.startsWith(key),
  );
  return folder ? (NON_LAYER_FOLDERS[folder] ?? []) : [];
}

/**
 * @param {string} location relative to `frontend/src`: '' (all of it), a folder ending in `/`, or a file
 * @param {Pattern[]} patterns
 * @returns {Config}
 */
function createConfig(location, patterns) {
  const files =
    location === '' || location.endsWith('/')
      ? `${SRC}/${location}**`
      : `${SRC}/${location}`;
  return {
    name: `frontend/layer-boundaries/${location || 'src'}`,
    files: [files],
    ignores: TEST_SUPPORT_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [NO_PARENT_RELATIVE_IMPORTS, ...patterns] },
      ],
    },
  };
}

/** @returns {Config[]} */
export function layerBoundaryConfigs() {
  const base = createConfig('', getPackagePatterns('', undefined));

  // Shared folders that aren't layers, then the single files a package rule
  // exempts (types/axios.d.ts), so a file's config comes after its folder's.
  const exemptLocations = PACKAGE_RULES.flatMap(
    (rule) => rule.allowedIn,
  ).filter((location) => !LAYERS.includes(location.replace(/\/$/, '')));
  const nonLayerLocations = [
    ...new Set([...Object.keys(NON_LAYER_FOLDERS), ...exemptLocations]),
  ].sort((a, b) => Number(!a.endsWith('/')) - Number(!b.endsWith('/')));
  const nonLayerConfigs = nonLayerLocations.map((location) =>
    createConfig(location, [
      ...getNonLayerModulePatterns(location),
      ...getPackagePatterns(location, undefined),
    ]),
  );

  const globalLayerConfigs = LAYERS.map((layer) =>
    createConfig(`${layer}/`, [
      ...getForbiddenLayerPatterns(layer),
      NO_MODULE_IMPORTS_FROM_SHARED_LAYERS,
      ...getPackagePatterns(`${layer}/`, layer),
    ]),
  );

  const moduleConfigs = getModuleNames().flatMap((moduleName) => {
    const moduleLocation = `modules/${moduleName}/`;
    // Files outside the module's layer folders (e.g. an index.ts).
    const wholeModule = createConfig(moduleLocation, [
      getCrossModulePattern(moduleName),
      ...getPackagePatterns(moduleLocation, undefined),
    ]);
    const moduleLayers = LAYERS.map((layer) =>
      createConfig(`${moduleLocation}${layer}/`, [
        ...getForbiddenLayerPatterns(layer),
        getCrossModulePattern(moduleName),
        ...getPackagePatterns(`${moduleLocation}${layer}/`, layer),
      ]),
    );
    return [wholeModule, ...moduleLayers];
  });

  /** @type {Config} */
  const testSupport = {
    name: 'frontend/layer-boundaries/tests',
    files: TEST_SUPPORT_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [NO_PARENT_RELATIVE_IMPORTS] },
      ],
    },
  };

  /** @type {Config} */
  const processEnv = {
    name: 'frontend/layer-boundaries/process-env',
    files: [`${SRC}/**`],
    ignores: [`${SRC}/config/**`],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through src/config.',
        },
      ],
    },
  };

  return [
    base,
    ...nonLayerConfigs,
    ...globalLayerConfigs,
    ...moduleConfigs,
    testSupport,
    processEnv,
  ];
}
