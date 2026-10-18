// Yarn의 peer workspace bin 목록에서 Vitest가 빠져도 앱이 선언한 러너를 실행한다.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const result = spawnSync(process.execPath, [cli, 'run', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
