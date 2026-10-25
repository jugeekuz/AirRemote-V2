import { defineConfig } from 'tsup';

// One self-contained file, so the Docker image can run migrations without node_modules.
export default defineConfig({
  entry: ['src/migrate.ts'],
  format: ['esm'],
  outDir: 'dist',
  noExternal: [/.*/],
  clean: true,
});
