import { describe, it, expect } from 'vitest';
import { appRoutes, resolveAppRoute, WebPathSchema } from './routes';
describe('community board navigation', () => {
  it('로그인은 원래 화면으로 돌아가며 외부 주소와 로그인 순환을 거부해야 한다', () => {
    const parent = appRoutes.boards('ko', 'coaching', '주말', undefined, { coachingRole: 'STUDENT' });
    const login = appRoutes.login('ko', parent);
    expect(resolveAppRoute(login)).toMatchObject({ path: login, screen: 'login', parent, tab: 'settings' });
    expect(resolveAppRoute('/ja/login')).toMatchObject({ screen: 'login', parent: '/ja' });
    ['https://outside.test', '//outside.test', '/en/guide', '/ko/login', '/ko/login?returnTo=%2Fko'].forEach(
      (path) => {
        expect(WebPathSchema.safeParse(appRoutes.login('ko', path)).success).toBe(false);
      },
    );
  });
  it('opens the composer with a board and game parent while rejecting unsupported classifications', () => {
    const compose = appRoutes.compose('ja', 'COACHING', 'another-game');
    expect(compose).toBe('/ja/write?board=coaching&game=another-game');
    expect(resolveAppRoute(compose)).toMatchObject({
      screen: 'compose',
      tab: 'boards',
      game: 'another-game',
      parent: '/ja/boards/coaching?game=another-game',
    });
    expect(resolveAppRoute('/ko/write')).toMatchObject({ screen: 'compose', tab: 'feed', parent: '/ko' });
    expect(WebPathSchema.safeParse('/ko/write?board=account-trade').success).toBe(false);
  });
  it('preserves board search and gives direct detail links a board parent', () => {
    const path = appRoutes.boards('en', 'friendly', 'practice match');
    expect(resolveAppRoute(path)).toMatchObject({ path, tab: 'boards', screen: 'boards', parent: '/en' });
    const post = appRoutes.post('ko', 'post-1', 'FRIENDLY');
    expect(post).toBe('/ko/posts/post-1?board=friendly');
    expect(resolveAppRoute(post)).toMatchObject({ tab: 'boards', parent: '/ko/boards/friendly' });
  });
  it('preserves battle filters and the team recruitment context through native route parsing', () => {
    const board = appRoutes.boards('ko', 'friendly', '주말', 'another-game', { battleMode: 'TEAM' });
    expect(resolveAppRoute(board)?.path).toBe(board);
    const compose = appRoutes.compose('ko', 'FRIENDLY', 'another-game', { battleMode: 'TEAM' });
    expect(resolveAppRoute(compose)).toMatchObject({
      path: compose,
      parent: appRoutes.boards('ko', 'friendly', undefined, 'another-game', { battleMode: 'TEAM' }),
    });
    for (const path of [
      '/ko/boards/friendly?battleMode=RAID',
      '/ko/boards/free?battleMode=TEAM',
      '/ko/write?board=free&battleMode=TEAM',
    ])
      expect(WebPathSchema.safeParse(path).success).toBe(false);
  });
  it('rejects unknown board slugs and duplicate or malformed queries', () => {
    for (const path of [
      '/ko/boards/unknown',
      '/ko/boards/account-trade',
      '/ko/boards/friends',
      '/ko/boards/marketplace',
      '/ko/posts/post-1?board=account-trade',
      '/ko/posts/post-1?board=unknown',
      '/ko/boards/friendly?q=a&q=b',
      '/ko/boards/friendly?q=%E0%A4%A',
    ])
      expect(WebPathSchema.safeParse(path).success).toBe(false);
  });
  it('opens friend-slot sales with the matching detail parent', () => {
    expect(appRoutes.boards('ko')).toBe('/ko/boards/feedback');
    expect(resolveAppRoute(appRoutes.post('ko', 'post-1', 'FRIEND_SALE'))).toMatchObject({
      tab: 'boards',
      parent: '/ko/boards/friend-sale',
    });
  });
  it('keeps the game and all five board routes through search, detail and native parsing', () => {
    for (const slug of ['feedback', 'friend-sale', 'friendly', 'coaching', 'free']) {
      const path = appRoutes.boards('en', slug, 'lesson', 'another-game');
      expect(resolveAppRoute(path)).toMatchObject({ path, game: 'another-game', screen: 'boards' });
    }
    expect(resolveAppRoute(appRoutes.boards('ko', 'free', undefined, 'test--game-'))).toMatchObject({
      game: 'test--game-',
    });
    const detail = appRoutes.post('ko', 'post-1', 'COACHING', 'another-game');
    expect(resolveAppRoute(detail)).toMatchObject({
      game: 'another-game',
      parent: '/ko/boards/coaching?game=another-game',
    });
    for (const game of ['../other', 'unknown/game', 'UPPERCASE']) {
      expect(WebPathSchema.safeParse(`/ko/boards/free?game=${encodeURIComponent(game)}`).success).toBe(false);
    }
  });
  it('preserves coaching and battle scopes through dedicated search and composition', () => {
    for (const [board, filters] of [
      ['coaching', { coachingRole: 'STUDENT' }],
      ['friendly', { battleMode: 'TEAM' }],
    ] as const) {
      const path = appRoutes.search('ko', { board, game: 'another-game', q: '주말', ...filters });
      expect(resolveAppRoute(path)).toMatchObject({
        path,
        screen: 'search',
        tab: 'boards',
        game: 'another-game',
        parent: appRoutes.boards('ko', board, '주말', 'another-game', filters),
      });
    }
    const compose = appRoutes.compose('en', 'COACHING', 'another-game', { coachingRole: 'STUDENT' });
    expect(resolveAppRoute(compose)).toMatchObject({
      path: compose,
      parent: '/en/boards/coaching?game=another-game&coachingRole=STUDENT',
    });
    expect(resolveAppRoute(appRoutes.search('ko', { q: '호그', tab: 'unanswered' }))).toMatchObject({
      screen: 'search',
      tab: 'feed',
      parent: '/ko?tab=unanswered&q=%ED%98%B8%EA%B7%B8',
    });
    for (const path of [
      '/ko/search?board=free&coachingRole=COACH',
      '/ko/search?coachingRole=STUDENT',
      '/ko/search?board=coaching&coachingRole=OTHER',
      '/ko/search?board=coaching&battleMode=TEAM',
      '/ko/search?board=unknown',
      '/ko/search?q=a&q=b',
      '/ko/boards/free?coachingRole=COACH',
      '/ko/write?board=free&coachingRole=STUDENT',
    ])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });
  it('preserves feedback status and game through search and its logical parent', () => {
    for (const feedbackStatus of ['WAITING', 'ANSWERED'] as const) {
      const board = appRoutes.boards('ko', 'feedback', '수비', 'another-game', { feedbackStatus });
      expect(resolveAppRoute(board)).toMatchObject({ path: board, screen: 'boards', game: 'another-game' });
      const search = appRoutes.search('ko', {
        board: 'feedback',
        game: 'another-game',
        q: '수비',
        feedbackStatus,
      });
      expect(resolveAppRoute(search)).toMatchObject({ path: search, screen: 'search', parent: board });
    }
    for (const path of [
      '/ko/boards/feedback?feedbackStatus=UNKNOWN',
      '/ko/boards/free?feedbackStatus=WAITING',
      '/ko/search?board=coaching&feedbackStatus=ANSWERED',
      '/ko/search?feedbackStatus=WAITING',
      '/ko/boards/feedback?feedbackStatus=WAITING&feedbackStatus=ANSWERED',
    ])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });
});
