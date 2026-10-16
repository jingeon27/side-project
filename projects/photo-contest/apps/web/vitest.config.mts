import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 날짜 포맷 결과가 기기 시간대에 따라 달라지지 않게 서비스 시간대로 고정한다.
process.env.TZ = 'Asia/Seoul';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 'server-only'는 Next 번들러가 처리한다. 테스트에서는 빈 모듈로 대신한다.
      'server-only': fileURLToPath(new URL('./vitest.server-only.ts', import.meta.url)),
    },
  },
  test: {
    maxWorkers: '10%',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{spec,test}.ts'],
          exclude: ['src/**/*.api.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.{spec,test}.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['src/**/*.api.spec.ts'],
          globalSetup: ['./vitest.api-setup.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
