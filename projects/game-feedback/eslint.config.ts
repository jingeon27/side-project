import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

// Web·Admin·Mobile은 각 앱의 eslint.config.ts가 소유한다. API·패키지·프로젝트 스크립트만 baseConfig로 묶는다.
export default defineConfig([
  { ignores: ['apps/web/**', 'apps/admin/**', 'apps/mobile/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
]);
