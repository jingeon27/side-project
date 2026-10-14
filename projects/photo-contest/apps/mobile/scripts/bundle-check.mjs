// Metro가 워크스페이스 패키지(브리지·zod)까지 실제로 번들을 만드는지만 확인하고 결과물은 남기지 않는다.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const OUTPUT_DIR = '.expo-export-check';

const result = spawnSync('expo', ['export', '--platform', 'android', '--output-dir', OUTPUT_DIR, '--clear'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
rmSync(OUTPUT_DIR, { recursive: true, force: true });
process.exit(result.status ?? 1);
