import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['src/**/*.spec.ts'] } },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.spec.tsx'],
          setupFiles: ['./vitest.setup.ts'],
          server: { deps: { inline: [/@base-ui\//] } },
          deps: {
            optimizer: {
              client: {
                enabled: true,
                include: ['use-sync-external-store/shim', 'use-sync-external-store/shim/with-selector'],
              },
            },
          },
        },
      },
    ],
  },
});
