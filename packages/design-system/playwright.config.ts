import { defineConfig, devices } from '@playwright/test';

/**
 * 패키지 코드가 직접 만든 레이아웃처럼 jsdom이 계산하지 않는 동작만 Storybook 스토리를 열어 확인한다.
 * 위치 계산, 포커스, 전환 중 입력처럼 Base UI가 맡은 동작은 다시 검증하지 않는다. 앱 서버와 API는 띄우지 않는다.
 */
export default defineConfig({
  testDir: './src',
  testMatch: '**/*.browser.spec.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: [['list']],
  outputDir: './test-results',
  use: { baseURL: 'http://127.0.0.1:3361', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'yarn exec storybook dev --host 127.0.0.1 --port 3361 --exact-port --ci',
    url: 'http://127.0.0.1:3361',
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
