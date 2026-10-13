import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { PROJECT_ROOT } from './paths';

/** 프로젝트 `.env`를 읽는다. 이미 설정된 환경변수는 덮어쓰지 않는다. */
export function loadProjectEnv() {
  const file = resolve(PROJECT_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
