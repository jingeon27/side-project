import { spawn } from 'node:child_process';

import { pythonEnvironment, pythonExecutable, pythonToolsExecutable } from './python.ts';

const tools = process.argv[2] === '--tools';
const bootstrap = process.argv[2] === '--bootstrap';
const args = process.argv.slice(tools || bootstrap ? 3 : 2);
const executable = () => {
  if (tools) return pythonToolsExecutable();
  if (bootstrap) return 'python3.11';
  return pythonExecutable();
};
if (!args[0]) throw new Error('실행할 Python 모듈을 지정하세요.');
const child = spawn(executable(), ['-m', ...args], { env: pythonEnvironment(), stdio: 'inherit' });
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
