import { defineConfig } from 'tsup';

// Workspace packages are inlined; third-party packages stay external.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  outDir: 'dist',
  noExternal: [/^@airremote\//],
  clean: true,
});
