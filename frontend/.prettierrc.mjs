/**
 * Imports are ordered bottom-up by layer, so every file shows its layering
 * (frontend/ARCHITECTURE.md, "Layers and import rules").
 * @type {import('prettier').Config}
 */
export default {
  singleQuote: true,
  importOrder: [
    '<BUILTIN_MODULES>',
    '^react$',
    '^react-native$',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@airremote/contracts(/.*)?$',
    '',
    '^@app-types(/.*)?$',
    '^@config/(.*)$',
    '^@utils/(.*)$',
    '^@adapters/(.*)$',
    '^@api/(.*)$',
    '^@queries/(.*)$',
    '^@stores/(.*)$',
    '^@helpers/(.*)$',
    '^@contexts/(.*)$',
    '^@hooks/(.*)$',
    '^@navigation/(.*)$',
    '^@modules/(.*)$',
    '^@screens/(.*)$',
    '^@components/(.*)$',
    '^@ui(/.*)?$',
    '^@assets/(.*)$',
    // The other tsconfig aliases. Not a bare `^@`: the first matching group
    // wins, and that would also take scoped packages (@tanstack/...).
    '^@(i18n|mocks)/(.*)$',
    '',
    '^[./]',
  ],
  tailwindStylesheet: './src/ui/global.css',
  tailwindFunctions: ['tv', 'cn'],
  // Resolved here, not named: the root's `prettier` would look names up from
  // where it runs (the repo root), but these are frontend dependencies.
  // prettier-plugin-tailwindcss must be the last plugin.
  plugins: [
    import.meta.resolve('@ianvs/prettier-plugin-sort-imports'),
    import.meta.resolve('prettier-plugin-tailwindcss'),
  ],
};
