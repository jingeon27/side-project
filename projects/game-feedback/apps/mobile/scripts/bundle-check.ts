// Build both native bundles with Metro, then remove this command's export output.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const OUTPUT_DIR = '.expo-export-check';
function checkBundles() {
  try {
    for (const platform of ['android', 'ios']) {
      const result = spawnSync(
        'expo',
        ['export', '--dev', '--platform', platform, '--output-dir', `${OUTPUT_DIR}/${platform}`],
        {
          stdio: 'inherit',
          shell: process.platform === 'win32',
          // 번들 내용은 빌드 변형과 무관하다. 운영 앱 링크 값 없이도 확인하도록 따로 주지 않으면 개발 설정으로 읽는다.
          env: { ...process.env, ENVIRONMENT: 'development' },
        },
      );
      if (result.status !== 0) {
        return result.status ?? 1;
      }
    }
    return 0;
  } finally {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
}
process.exitCode = checkBundles();
