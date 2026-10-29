import { defineConfig, devices } from '@playwright/test';

import { buildAppUserAgent } from '@photo-contest/bridge';
import { apiWebServer, prepareE2eDatabase } from '@photo-contest/test-kit';

import { E2E_API_PORT, E2E_APP_VERSION, E2E_WEB_ORIGIN, E2E_WEB_PORT } from './e2e/support/e2e-env';

/** 앱 WebView가 User-Agent 뒤에 붙이는 토큰(applicationNameForUserAgent)과 같게 맞춘다. */
const APP_USER_AGENT = ` ${buildAppUserAgent(E2E_APP_VERSION)}`;

const database = prepareE2eDatabase('mobile_e2e');

/**
 * 웹 화면을 앱 WebView처럼 띄우고(e2e/support/native-host.ts) 모바일의 실제 라우터·기능 로직과 붙여 본다.
 * 격리 스키마 API(4330)와 별도 빌드 폴더의 웹 dev 서버(3330)를 쓴다. 개발 서버(3200/4200)는 건드리지 않는다.
 */
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_WEB_ORIGIN,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'android-webview',
      use: { ...devices['Pixel 7'], userAgent: `${devices['Pixel 7'].userAgent}${APP_USER_AGENT}` },
    },
    {
      name: 'ios-webview',
      use: { ...devices['iPhone 15'], userAgent: `${devices['iPhone 15'].userAgent}${APP_USER_AGENT}` },
    },
  ],
  webServer: [
    apiWebServer({
      port: E2E_API_PORT,
      webOrigin: E2E_WEB_ORIGIN,
      database,
    }),
    {
      // 웹 워크스페이스의 next로 실행한다. yarn 스크립트 안에서는 PATH에 yarn이 있다.
      command: `yarn workspace @photo-contest/web exec next dev -p ${E2E_WEB_PORT}`,
      url: `${E2E_WEB_ORIGIN}/backend/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      env: {
        API_URL: `http://127.0.0.1:${E2E_API_PORT}`,
        WEB_ORIGIN: E2E_WEB_ORIGIN,
        SENTRY_DSN: '',
        NEXT_PUBLIC_SENTRY_DSN: '',
        NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
      },
    },
  ],
});
