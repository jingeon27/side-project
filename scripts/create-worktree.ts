import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { copyWorktreeEnv } from './copy-worktree-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const worktrees = () =>
  execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
const before = new Set(worktrees());
const result = spawnSync('git', ['worktree', 'add', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const target of worktrees().filter((directory) => !before.has(directory))) {
  const copied = copyWorktreeEnv(target);
  console.log(`worktree: 로컬 환경 파일 ${copied.length}개 복사 (기존 파일 보존)`);
}
