import { URL, fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// 날짜 계산이 개발 PC 시간대에 따라 달라지지 않게 서비스 기준 시간대로 고정한다.
process.env.TZ = 'Asia/Seoul';

const SOURCE_DIR = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: SOURCE_DIR }],
  },
  test: {
    maxWorkers: '10%',
    env: { TZ: 'Asia/Seoul' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{spec,test}.ts'],
          exclude: [...configDefaults.exclude, 'src/**/*.api.{spec,test}.ts'],
        },
      },
      {
        extends: true,
        // 네이티브 렌더러 대신 react-native-web(DOM)으로 화면 로직을 검증한다. 네이티브 모듈은 각 spec이 vi.mock으로 바꾼다.
        resolve: {
          alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
        },
        define: { __DEV__: 'true' },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.{spec,test}.tsx'],
          setupFiles: ['./vitest.setup.ts'],
          // env.ts가 모듈을 읽을 때 정하므로 테스트마다 같은 웹 origin을 쓰게 고정한다.
          // 오류 수집·분석도 켜 두고, 실제 전송 대신 vitest.setup.ts의 SDK 대역이 호출을 기록한다.
          env: {
            TZ: 'Asia/Seoul',
            EXPO_PUBLIC_WEB_ORIGIN: 'https://contest.example',
            EXPO_PUBLIC_SENTRY_DSN: 'https://public@sentry.example/1',
            EXPO_PUBLIC_AMPLITUDE_API_KEY: 'amplitude-test-key',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['src/**/*.api.{spec,test}.ts'],
          globalSetup: ['./vitest.api-setup.ts'],
          // 격리 API는 첫 실행 때 apps/api를 빌드하고 마이그레이션까지 적용한다.
          hookTimeout: 240_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
