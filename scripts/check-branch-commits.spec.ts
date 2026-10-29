import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { branchCommits, checkBranchCommits } from './check-branch-commits';

const commit = (message: string, sha = '0123456789abcdef') => ({ sha, message });

describe('PR 브랜치 커밋 검사', () => {
  it('릴리스 PR은 도입 전 이력만 제외하고 develop의 새 커밋과 곁가지도 검사한다', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'branch-commits-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const save = (message: string) => {
      git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', message);
      return git('rev-parse', 'HEAD');
    };
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.name', 'Test');
      git('config', 'user.email', 'test@example.invalid');
      const base = save('초기 릴리스');
      git('checkout', '-qb', 'old-feature');
      const side = save('잘못된 새 곁가지 커밋');
      git('checkout', '-qb', 'develop', base);
      const legacyHistory = save('이전 squash 제목 (#18)');
      const valid = save('ci: 커밋 검사를 도입한다');
      const invalid = save('잘못된 새 커밋');
      git('-c', 'commit.gpgsign=false', 'merge', '--no-ff', '-qm', 'Merge old-feature', 'old-feature');
      const commits = branchCommits({ base, legacyHistory, cwd });
      expect(commits.map(({ sha }) => sha)).toEqual(expect.arrayContaining([side, valid, invalid]));
      expect(commits).toHaveLength(3);
      expect(checkBranchCommits(commits)).toHaveLength(2);
      expect(branchCommits({ base: valid, legacyHistory, cwd }).map(({ sha }) => sha)).toEqual(
        expect.arrayContaining([side, invalid]),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('규칙 형식의 커밋만 있으면 통과시킨다', () => {
    expect(
      checkBranchCommits([
        commit('feat(web): 사진 좋아요 버튼을 추가한다\n\n본문'),
        commit('test(test-kit): 격리 스키마 정리를 검사한다'),
        commit('Revert "feat(web): 사진 좋아요 버튼을 추가한다"'),
      ]),
    ).toEqual([]);
  });

  it.each([
    'fixup! feat(web): 사진 좋아요 버튼을 추가한다',
    'squash! feat(web): 사진 좋아요 버튼을 추가한다',
    'amend! feat(web): 사진 좋아요 버튼을 추가한다',
    'chore(web): WIP 임시 저장',
    'wip: 임시 저장',
  ])('병합 전에 합쳐야 하는 커밋 %s를 거부한다', (message) => {
    const [problem] = checkBranchCommits([commit(message)]);
    expect(problem).toContain('01234567');
    expect(problem).toContain('rebase --autosquash');
  });

  it('형식이 틀린 커밋과 Co-Authored-By trailer를 커밋마다 알려 준다', () => {
    const problems = checkBranchCommits([
      commit('사진 좋아요 버튼 추가', 'aaaaaaaa11111111'),
      commit(
        'feat(web): 버튼을 추가한다\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
        'bbbbbbbb22222222',
      ),
      commit('feat(web): 정상 커밋', 'cccccccc33333333'),
    ]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('aaaaaaaa');
    expect(problems[0]).toContain('형식이 맞지 않습니다');
    expect(problems[1]).toContain('bbbbbbbb');
    expect(problems[1]).toContain('Co-Authored-By');
  });

  it.each([
    'fix(api): wiping 작업의 경합을 고친다',
    'ci: PR 브랜치에 남은 fixup·WIP·형식 오류 커밋을 merge 전에 막는다',
  ])('WIP를 설명 중간에 언급하거나 다른 단어의 일부일 때는 막지 않는다: %s', (message) => {
    expect(checkBranchCommits([commit(message)])).toEqual([]);
  });
});
