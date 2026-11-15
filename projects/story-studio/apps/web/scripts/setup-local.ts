import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const run = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`로컬 환경 준비 실패 (${code})`)),
    );
  });
const data = path.resolve(process.env.STORY_STUDIO_DATA_DIR || path.join(process.cwd(), '.data'));
const local = path.join(data, 'local');
const python = path.join(local, '.venv/bin/python');
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('현재 로컬 실행은 Apple Silicon Mac을 지원합니다');
if (!existsSync(python))
  await run(process.env.PYTHON || 'python3.11', ['-m', 'venv', path.join(local, '.venv')]);
await run(python, ['-m', 'pip', 'install', '-r', 'scripts/local/requirements.txt']);
const options = process.argv.includes('--voice-training') ? ['--only', 'voice-training'] : [];
await run(python, ['scripts/local/setup.py', '--data-dir', data, ...options]);
