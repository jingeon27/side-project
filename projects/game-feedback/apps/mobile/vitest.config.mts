import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  test: {
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{spec,test}.ts', 'app.config.spec.ts'],
        },
      },
      {
        extends: true,
        resolve: { alias: [{ find: /^react-native$/, replacement: 'react-native-web' }] },
        define: { __DEV__: 'true' },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.{spec,test}.tsx'],
          setupFiles: ['./vitest.setup.ts'],
          env: { EXPO_PUBLIC_WEB_ORIGIN: 'https://feedback.example' },
        },
      },
    ],
  },
});
