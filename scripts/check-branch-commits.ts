import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkCommitMessage, commitSubject } from './check-commit-message.ts';

// Pull requests are merged with merge commits, so every branch commit stays in develop as written.
// Autosquash markers and work-in-progress commits must be folded into the commit they belong to first.
// WIP counts only as the type or the start of the description, so subjects may still mention it.
const UNFINISHED = /^(?:(?:fixup|squash|amend)! |wip\b|[a-z]+(?:\([^)]*\))?!?: wip\b)/i;
// PR 검사 도입 직전에 이미 공유된 이력이다. 릴리스 PR에서도 이 이후 커밋은 전부 검사한다.
const LEGACY_HISTORY = 'ebe5571f84ab216ab41ac67a529f1ae4bf5c29da';

export interface IBranchCommit {
  sha: string;
  message: string;
}

/** Problems with the commits a pull request would add, one entry per offending commit. */
export function checkBranchCommits(commits: readonly IBranchCommit[]) {
  return commits.flatMap(({ sha, message }) => {
    const subject = commitSubject(message);
    if (UNFINISHED.test(subject))
      return [
        `${sha.slice(0, 8)} ${subject}\n  fixup·squash·WIP 커밋은 병합 전에 원래 커밋과 합칩니다(git rebase --autosquash <base>).`,
      ];
    const error = checkCommitMessage(message);
    return error ? [`${sha.slice(0, 8)} ${error}`] : [];
  });
}

/** PR에 추가되는 커밋 중 검사 도입 전 공유 이력만 제외한다. 가변 develop ref로 면제하지 않는다. */
export function branchCommits({
  base,
  head = 'HEAD',
  legacyHistory = LEGACY_HISTORY,
  cwd = process.cwd(),
}: {
  base: string;
  head?: string;
  legacyHistory?: string;
  cwd?: string;
}): IBranchCommit[] {
  const log = execFileSync(
    'git',
    ['log', '--reverse', '--no-merges', '--format=%H%x00%B%x1e', `${base}..${head}`, `^${legacyHistory}`],
    {
      encoding: 'utf8',
      cwd,
    },
  );
  return log
    .split('\x1e')
    .map((entry) => entry.trimStart())
    .filter(Boolean)
    .map((entry) => {
      const [sha = '', message = ''] = entry.split('\0');
      return { sha, message };
    });
}

export function main(base = process.argv[2]) {
  if (!base) {
    console.error('사용법: node scripts/check-branch-commits.ts <기준 ref, 예: origin/develop>');
    process.exitCode = 2;
    return;
  }
  const commits = branchCommits({ base });
  const problems = checkBranchCommits(commits);
  if (problems.length === 0) {
    console.log(`${base} 이후 커밋 ${commits.length}개의 메시지를 확인했습니다.`);
    return;
  }
  console.error(
    [
      `PR은 merge commit으로 합치므로 아래 커밋이 대상 브랜치 이력에 그대로 남습니다. 브랜치를 정리한 뒤 다시 push합니다.`,
      '',
      ...problems,
    ].join('\n'),
  );
  process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
