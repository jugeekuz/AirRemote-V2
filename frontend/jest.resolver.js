const path = require('path');

// Reanimated and Worklets ship Jest resolvers that pick some files' web
// (non-`.native`) variants. They tell the packages apart by a substring of
// the path, but pnpm names Reanimated's folder
// `.pnpm/react-native-reanimated@x_react-native-worklets@y/...`, so every
// Reanimated file would look like Worklets. This resolver applies the same
// rules, matching the real package folders.

const inPackage = (dir, name) =>
  dir.includes(`${path.sep}node_modules${path.sep}${name}${path.sep}`);

// From react-native-reanimated/jest/resolver.js (4.7.1).
const REANIMATED_WEB_ONLY_IN_JEST = new Set([
  'initializers',
  'mutables',
  'mappers',
  'ConfigHelper',
  'UpdateLayoutAnimations',
  'useAnimatedRef',
  'useAnimatedStyle',
  'WorkletEventHandler',
  'JSPropsUpdater',
  'updateProps',
  'util',
  'css/component/AnimatedComponent',
]);

const withoutNativeExtensions = (options) => ({
  ...options,
  extensions: options.extensions?.filter((ext) => !ext.includes('native')),
});

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) => {
  const basename = request.split('/').pop();
  const isReanimatedWebOnly =
    request.startsWith('.') &&
    inPackage(options.basedir, 'react-native-reanimated') &&
    [...REANIMATED_WEB_ONLY_IN_JEST].some((entry) =>
      entry.includes('/') ? request.endsWith(entry) : basename === entry,
    );
  const isWorklets =
    inPackage(options.basedir, 'react-native-worklets') ||
    request === 'react-native-worklets' ||
    request.startsWith('react-native-worklets/');

  return options.defaultResolver(
    request,
    isReanimatedWebOnly || isWorklets
      ? withoutNativeExtensions(options)
      : options,
  );
};
