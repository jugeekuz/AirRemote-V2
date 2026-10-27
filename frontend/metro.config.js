const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Uniwind compiles the Tailwind entry and writes the class-name types.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/ui/global.css',
  dtsFile: './src/ui/uniwind-types.d.ts',
});
