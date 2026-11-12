import { defineConfig } from 'knip/config';

const appEntries = [
  '*.config.{ts,mts,cts,js,mjs,cjs}',
  '{scripts,e2e}/*.{ts,js,mjs,cjs}',
  '**/*.{spec,test,e2e}.{ts,tsx}',
];

const mobileWorkspace = {
  entry: appEntries,
  // 앱 환경을 읽는 Expo 설정은 실행하지 않고 appEntries로 정적 분석한다. Babel 연결은 유지한다.
  expo: { config: [] },
  ignoreDependencies: [
    'expo-build-properties', // app.config.ts의 문자열로 등록하는 네이티브 빌드 플러그인
    'expo-dev-client', // Expo가 자동 포함하는 개발 클라이언트
    'expo-system-ui', // userInterfaceStyle·backgroundColor 설정을 적용하는 네이티브 모듈
  ],
};

export default defineConfig({
  ignoreExportsUsedInFile: true,
  ignore: ['**/generated/**', '**/__fixtures__/**'],
  // Playwright는 여러 앱에서 서로 다른 설치를 사용하므로 설정을 실행하지 않고 정적으로 분석한다.
  playwright: false,
  workspaces: {
    '.': {
      entry: ['scripts/*.ts'],
      // Next는 대상 앱에서, scripts 옆 단위 테스트의 Vitest는 @side/config에서 제공한다.
      ignoreDependencies: ['next', 'vitest'],
    },
    'packages/config': {
      // createRequire로 읽는 CommonJS 설정과 플러그인이다.
      ignoreDependencies: ['eslint-config-expo', 'eslint-plugin-jsx-a11y'],
    },
    // test:browser가 쓰는 Playwright 설정이다.
    'packages/design-system': { entry: ['playwright.config.ts'] },
    'projects/photo-contest': { entry: ['scripts/*.ts'] },
    'projects/*/apps/*': { entry: appEntries },
    'projects/blog/apps/web': { entry: [...appEntries, 'vercel.ts'] },
    'projects/photo-contest/apps/web': { entry: [...appEntries, 'test/browser/main.tsx'] },
    // k6의 내장 모듈은 npm 의존성이 아니다.
    'projects/*/apps/*/scripts': { entry: ['*.{ts,js}'], ignoreDependencies: ['k6'] },
    'projects/game-feedback/apps/mobile': mobileWorkspace,
    'projects/photo-contest/apps/mobile': mobileWorkspace,
    'projects/photo-contest/apps/api': {
      // database 프로젝트는 CLI로 선택할 때만 등록되므로 초기화 진입점을 명시한다.
      entry: [
        'src/main.ts',
        '*.config.{ts,mts,cts,js,mjs,cjs}',
        '**/*.{spec,test,e2e}.{ts,tsx}',
        'test/support/database-global-setup.ts',
      ],
      // 같은 수치를 쓰되 용도를 구분하는 페이지 크기 상수다.
      ignoreIssues: { 'src/config/limits.ts': ['duplicates'] },
      // Nest GraphQL과 생성 Prisma client가 런타임에 읽는다.
      ignoreDependencies: ['@as-integrations/express5', '@prisma/client'],
    },
    'projects/game-feedback/apps/api': {
      ignoreDependencies: ['@prisma/client'],
    },
    'projects/game-feedback': {
      entry: ['scripts/*.ts'],
      // scripts 옆 테스트는 API 워크스페이스가 선언한 Vitest로 실행한다.
      ignoreDependencies: ['vitest'],
    },
  },
});
