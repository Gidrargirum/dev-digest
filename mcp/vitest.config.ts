import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Same alias as tsconfig.json's `paths` — vitest/vite don't read
      // tsconfig path mappings on their own, so it has to be mirrored here.
      // Matches reviewer-core/vitest.config.ts, which borrows the same
      // vendored contracts the same way.
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
