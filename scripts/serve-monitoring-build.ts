import { cp } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = process.cwd();
const { default: config } = (await import(pathToFileURL(resolve(appRoot, 'next.config.ts')).href)) as {
  default: { distDir: string; outputFileTracingRoot: string };
};
const buildRoot = resolve(appRoot, config.distDir);
const standalone = resolve(buildRoot, 'standalone', relative(config.outputFileTracingRoot, appRoot));

// 배포 이미지와 같이 tracing 산출물에 static/public을 붙여 실행한다.
await cp(resolve(buildRoot, 'static'), resolve(standalone, config.distDir, 'static'), { recursive: true });
await cp(resolve(appRoot, 'public'), resolve(standalone, 'public'), { recursive: true }).catch((error) => {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
});
const origin = new URL(process.env.WEB_ORIGIN ?? '');
if (!['localhost', '127.0.0.1'].includes(origin.hostname) || !origin.port)
  throw new Error('모니터링 검사는 명시한 loopback 웹 포트에서만 실행합니다.');
process.env.HOSTNAME = '127.0.0.1';
process.env.PORT = origin.port;
await import(pathToFileURL(resolve(standalone, 'server.js')).href);
