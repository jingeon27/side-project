import { spawn } from 'node:child_process';

import { DATA_DIR } from '../shared/data-dir.ts';
import { arenaProcess, startArenaInBackground } from './process.ts';

const args = process.argv.slice(2);
const background = args.includes('--background');
const main = async () => {
  if (background && args[0] !== 'start') throw new Error('--background는 start에서만 지원합니다.');
  const forwarded = args.filter((arg) => arg !== '--background');
  if (background) {
    console.log(JSON.stringify({ started: true, ...(await startArenaInBackground(DATA_DIR, forwarded)) }));
    return;
  }
  const run = arenaProcess(DATA_DIR, forwarded);
  const child = spawn(run.command, run.args, { env: run.env, stdio: 'inherit' });
  child.once('error', (error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
  await new Promise<void>((resolve) =>
    child.once('close', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    }),
  );
};
await main();
