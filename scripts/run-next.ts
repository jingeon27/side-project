import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 앱을 직접 실행해도 프로젝트 집계 명령과 같은 설정을 빌드 전에 읽는다.
try {
  process.loadEnvFile(resolve('../../.env'));
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

// 로컬 .env의 development가 Next 운영 빌드에 섞이지 않게 한다.
if (['build', 'start'].includes(process.argv[2] ?? '')) process.env.NODE_ENV = 'production';

const require = createRequire(resolve('package.json'));
await import(pathToFileURL(require.resolve('next/dist/bin/next')).href);
