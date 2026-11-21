import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { match } from 'ts-pattern';

const engine = path.resolve(process.cwd(), '../engine');
const run = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, PYTHONPATH: path.join(engine, 'src') },
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`로컬 환경 준비 실패 (${code})`)),
    );
  });
const data = path.resolve(process.env.STORY_STUDIO_DATA_DIR || path.join(process.cwd(), '.data'));
const local = path.join(data, 'local');
const python = path.join(local, '.venv/bin/python');
const [profile, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('설치 옵션은 하나만 지정하세요.');
const dependencies = match(profile)
  .with(undefined, '--voice-training', () => 'apple-silicon')
  .with('--image', () => 'image')
  .with('--shorts-voice', () => 'shorts')
  .otherwise(() => {
    throw new Error('지원하는 설치 옵션은 --image, --voice-training, --shorts-voice입니다.');
  });
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('현재 로컬 실행은 Apple Silicon Mac을 지원합니다');
if (!existsSync(python))
  await run(process.env.PYTHON || 'python3.11', ['-m', 'venv', path.join(local, '.venv')]);
await run(python, ['-m', 'pip', 'install', '-e', `${engine}[${dependencies}]`]);
const options = profile ? ['--only', profile.slice(2)] : [];
await run(python, ['-m', 'story_studio.setup', '--data-dir', data, ...options]);
