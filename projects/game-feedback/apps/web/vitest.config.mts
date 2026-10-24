import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./vitest.server-only.ts', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    projects: [
      {
        extends: true,
        // 루트의 *.spec.ts는 next.config처럼 앱 설정 파일 옆에 둔 테스트다.
        test: { name: 'unit', environment: 'node', include: ['*.{spec,test}.ts', 'src/**/*.{spec,test}.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.{spec,test}.tsx'],
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
