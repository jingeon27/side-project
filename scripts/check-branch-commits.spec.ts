import { checkBranchCommits } from './check-branch-commits';

const commit = (message: string, sha = '0123456789abcdef') => ({ sha, message });

describe('PR 브랜치 커밋 검사', () => {
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
