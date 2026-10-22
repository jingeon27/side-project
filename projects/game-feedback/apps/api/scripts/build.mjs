import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const outputDir = new URL('../dist/', import.meta.url);
rmSync(outputDir, { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [
    require.resolve('@side/typescript-config/compiler'),
    '-p',
    fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync(new URL('../src/generated/prisma/', import.meta.url), new URL('generated/prisma/', outputDir), {
  recursive: true,
});
