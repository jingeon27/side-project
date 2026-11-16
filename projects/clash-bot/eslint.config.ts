import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

// .data는 실행 기록과 Python 도구 환경이며 저장소 코드가 아니다.
export default defineConfig([{ ignores: ['.data/**'] }, ...baseConfig, tsconfigRootDir(import.meta.dirname)]);
