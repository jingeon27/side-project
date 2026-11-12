import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    // 패키지가 만든 레이아웃은 jsdom이 계산하지 않아 test:browser의 Playwright가 실행한다.
    exclude: ['src/**/*.browser.{spec,test}.ts'],
  },
});
