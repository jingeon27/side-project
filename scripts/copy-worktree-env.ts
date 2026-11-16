import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** 기본 worktree의 로컬 설정만 복사한다. 기존 설정과 버전 관리하는 예제는 보존한다. */
export function copyWorktreeEnv(targetRoot: string) {
  if (!existsSync(path.join(targetRoot, '.git'))) return [];
  const git = (args: string[]) => execFileSync('git', args, { cwd: targetRoot, encoding: 'utf8' });
  const sourceRoot = git(['worktree', 'list', '--porcelain', '-z'])
    .split('\0')
    .find((field) => field.startsWith('worktree '))
    ?.slice('worktree '.length);
  if (!sourceRoot || path.resolve(sourceRoot) === path.resolve(targetRoot)) return [];
  const templates = git([
    'ls-files',
    '-z',
    '--',
    '.env.example',
    '**/.env.example',
    '**/.env.production.example',
  ])
    .split('\0')
    .filter(Boolean);
  const directories = new Set(['.', ...templates.map(path.dirname)]);
  const copied: string[] = [];
  for (const directory of directories) {
    const source = path.join(sourceRoot, directory);
    if (!existsSync(source) || !existsSync(path.join(targetRoot, directory))) continue;
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (!entry.isFile() || !/^\.env(?:\..+)?$/.test(entry.name) || entry.name.endsWith('.example'))
        continue;
      const relative = path.join(directory, entry.name);
      // Git에서 추적하는 설정은 checkout 결과가 기준이다.
      const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', relative], { cwd: targetRoot });
      if (ignored.error) throw ignored.error;
      if (ignored.status !== 0) continue;
      try {
        writeFileSync(path.join(targetRoot, relative), readFileSync(path.join(source, entry.name)), {
          flag: 'wx',
          mode: 0o600,
        });
        copied.push(relative);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
    }
  }
  return copied;
}
