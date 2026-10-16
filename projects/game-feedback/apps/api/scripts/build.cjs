const { spawnSync } = require('node:child_process');
const { cpSync } = require('node:fs');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync('src/generated/prisma', 'dist/generated/prisma', { recursive: true });
