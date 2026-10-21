// Build both native bundles with Metro, then remove this command's export output.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const OUTPUT_DIR = '.expo-export-check';
let exitCode = 0;
try {
  for (const platform of ['android', 'ios']) {
    const result = spawnSync(
      'expo',
      ['export', '--platform', platform, '--output-dir', `${OUTPUT_DIR}/${platform}`],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
process.exitCode = exitCode;
