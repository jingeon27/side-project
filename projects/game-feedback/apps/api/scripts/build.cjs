const { spawnSync } = require('node:child_process');
const { cpSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const apiDir = join(__dirname, '..');
const outputDir = join(apiDir, 'dist');
rmSync(outputDir, { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', join(apiDir, 'tsconfig.json')],
  {
    stdio: 'inherit',
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync(join(apiDir, 'src/generated/prisma'), join(outputDir, 'generated/prisma'), { recursive: true });
