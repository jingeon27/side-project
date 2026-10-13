import { spawn } from 'node:child_process';
const [workspace, task] = process.argv.slice(2);
const child = spawn('corepack', ['yarn', 'workspace', workspace, task], {
  stdio: 'inherit',
  env: { ...process.env, ...(task === 'build' ? { NODE_ENV: 'production' } : {}) },
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
