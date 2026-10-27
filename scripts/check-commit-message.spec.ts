import { checkCommitMessage, commitSubject } from './check-commit-message';

describe('커밋 메시지 형식 검사', () => {
  it.each([
    'feat(web): 사진 좋아요 버튼을 추가한다',
    'chore(deps): API에 es-toolkit과 ts-pattern을 추가한다',
    'fix(game-feedback): 대댓글 알림을 고친다',
    'docs: 공통 EC2 배포 절차를 기록한다',
    'chore: husky로 커밋 전 포맷과 커밋 메시지를 검사한다',
    'perf(deploy): 두 웹의 Next 컴파일 캐시를 빌드 간 복원한다',
    'ci(game-feedback): 모바일 검사와 양쪽 WebView E2E 연결',
    'build(game-feedback): exclude generated OpenAPI from Git',
    'style(blog): 장식과 상투적인 문구를 덜어낸다',
    'revert(api): 사진 목록 커서 전환을 되돌린다',
    'test(test-kit): 격리 스키마 정리를 검사한다',
    'refactor(eslint-config): 규칙을 폴더로 나눈다',
    'merge(game-feedback,photo-contest): develop 배포 설정 충돌을 해결한다',
    'feat(api)!: 응답 형식을 바꾼다',
  ])('%s를 통과시킨다', (message) => expect(checkCommitMessage(message)).toBeNull());

  it.each([
    "Merge branch 'develop' into feat/game-feedback",
    "Merge remote-tracking branch 'origin/develop'",
    'Merge pull request #6 from jingeon27/feat/blog-mdx-migration',
    'Revert "feat(web): 사진 좋아요 버튼을 추가한다"',
    'Reapply "feat(web): 사진 좋아요 버튼을 추가한다"',
    'fixup! feat(web): 사진 좋아요 버튼을 추가한다',
    'squash! feat(web): 사진 좋아요 버튼을 추가한다',
    'amend! feat(web): 사진 좋아요 버튼을 추가한다',
  ])('Git 자동 메시지 %s를 통과시킨다', (message) => expect(checkCommitMessage(message)).toBeNull());

  it.each([
    '사진 좋아요 버튼 추가',
    'wip: 임시 저장',
    'Feat(web): 대문자 type',
    'feat(Web): 대문자 scope',
    'feat(): 빈 scope',
    'feat(game feedback): 공백 scope',
    'feat(web):붙여 쓴 설명',
    'feat(web) : 띄운 콜론',
    'feat(web): ',
    ' feat(web): 앞 공백',
    '(Game Mate) 모바일 가이드와 제목 바로가기',
  ])('%s를 거부한다', (message) => expect(checkCommitMessage(message)).toContain('형식이 맞지 않습니다'));

  it('거부할 때 형식과 허용 type, 건너뛰는 방법을 알려 준다', () => {
    const error = checkCommitMessage('사진 좋아요 버튼 추가');
    expect(error).toContain('사진 좋아요 버튼 추가');
    expect(error).toContain('<type>(<scope>)');
    expect(error).toContain('feat · fix · refactor');
    expect(error).toContain('--no-verify');
  });

  it('편집기 주석과 앞쪽 빈 줄을 건너뛰고 첫 줄만 검사한다', () => {
    const message =
      '\n# 주석은 Git이 지운다\n\nfeat(web): 버튼을 추가한다\n\n본문은 자유롭게 쓴다\n# Please enter the commit message\n';
    expect(commitSubject(message)).toBe('feat(web): 버튼을 추가한다');
    expect(checkCommitMessage(message)).toBeNull();
    expect(checkCommitMessage('# 주석\n잘못된 제목\nfeat(web): 둘째 줄')).toContain('잘못된 제목');
  });

  it('git commit -v의 diff 아래는 읽지 않는다', () => {
    const scissors = '# ------------------------ >8 ------------------------';
    expect(commitSubject(`${scissors}\ndiff --git a/x b/x\n`)).toBe('');
    expect(checkCommitMessage(`fix(api): 오류를 고친다\n${scissors}\n+잘못된 줄\n`)).toBeNull();
  });

  it('CRLF 줄바꿈과 끝 공백을 허용한다', () => {
    expect(checkCommitMessage('fix(web): 오류를 고친다  \r\n\r\n본문\r\n')).toBeNull();
  });

  it('빈 메시지는 Git이 중단하므로 따로 막지 않는다', () => {
    expect(checkCommitMessage('')).toBeNull();
    expect(checkCommitMessage('# 주석만 남은 메시지\n\n')).toBeNull();
  });

  it.each([
    'feat(web): 버튼을 추가한다\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    'fix(api): 오류를 고친다\n\nco-authored-by: someone <a@example.com>',
    "Merge branch 'develop'\n\n  Co-authored-by: someone <a@example.com>",
  ])('Co-Authored-By trailer를 거부한다: %#', (message) =>
    expect(checkCommitMessage(message)).toContain('Co-Authored-By'),
  );

  it('주석이나 diff 아래의 Co-Authored-By는 Git이 지우므로 막지 않는다', () => {
    const scissors = '# ------------------------ >8 ------------------------';
    expect(checkCommitMessage('feat(web): 버튼을 추가한다\n# Co-Authored-By: 예시\n')).toBeNull();
    expect(checkCommitMessage(`feat(web): 버튼을 추가한다\n${scissors}\nCo-Authored-By: x\n`)).toBeNull();
  });
});
