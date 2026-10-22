import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const MIGRATIONS = 'projects/game-feedback/apps/api/prisma/migrations';

// 테스트마다 격리된 임시 저장소를 만들고 끝나면 지운다.
export function withGitRepo(run: (repo: ReturnType<typeof createRepo>) => void) {
  const cwd = mkdtempSync(join(tmpdir(), 'migration-check-'));
  try {
    run(createRepo(cwd));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function createRepo(cwd: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'develop');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), text);
  };
  return {
    cwd,
    git,
    put: (name: string, sql: string) => write(`${MIGRATIONS}/${name}/migration.sql`, sql),
    move: (from: string, to: string) => {
      mkdirSync(join(cwd, MIGRATIONS, to), { recursive: true });
      renameSync(join(cwd, MIGRATIONS, from, 'migration.sql'), join(cwd, MIGRATIONS, to, 'migration.sql'));
    },
    commit: (message: string, file = message) => {
      write(file, message);
      git('add', '-A');
      git('commit', '-qm', message);
      return git('rev-parse', 'HEAD');
    },
  };
}
