import { describe, expect, it } from 'vitest';

import { appRoutes, resolveAppRoute, WebPathSchema } from './routes';

describe('community board navigation', () => {
  it('프로필 수정은 프로필 탭 안의 독립 화면으로 이동한다', () => {
    for (const locale of ['ko', 'en', 'ja']) {
      expect(resolveAppRoute(appRoutes.editProfile(locale))).toMatchObject({
        screen: 'profile-edit',
        tab: 'settings',
        parent: appRoutes.settings(locale),
      });
    }
  });
  it('가이드는 프로필 안내 아래의 화면이며 별도 탭을 만들지 않아야 한다', () => {
    for (const locale of ['ko', 'en', 'ja'])
      expect(resolveAppRoute(appRoutes.guide(locale))).toMatchObject({
        screen: 'guide',
        tab: 'settings',
        parent: appRoutes.settings(locale),
      });
  });
  it.each(['terms', 'privacy', 'contact'] as const)(
    '안내 화면 %s는 피드 아래의 고정 화면이어야 한다',
    (screen) => {
      for (const locale of ['ko', 'en', 'ja'])
        expect(resolveAppRoute(appRoutes[screen](locale))).toMatchObject({
          path: `/${locale}/${screen}`,
          screen,
          parent: appRoutes.feed(locale),
        });
    },
  );
  it.each(['login', 'onboarding'] as const)(
    '인증 화면 %s는 같은 언어의 안전한 복귀 경로만 보존해야 한다',
    (screen) => {
      const parent = appRoutes.boards('ja', 'coaching', '週末', 'another-game', { coachingRole: 'STUDENT' });
      const path = appRoutes[screen]('ja', parent);
      expect(resolveAppRoute(path)).toMatchObject({ path, screen, tab: 'settings', parent, locale: 'ja' });
      expect(resolveAppRoute(appRoutes[screen]('en'))).toMatchObject({ screen, parent: '/en' });
      for (const legal of ['/ja/terms', '/ja/privacy', '/ja/contact']) {
        expect(resolveAppRoute(appRoutes[screen]('ja', legal))?.parent).toBe(legal);
      }
      for (const unsafe of [
        'https://outside.test/ja',
        '//outside.test/ja',
        '/en/guide',
        '/ja/login',
        '/ja/onboarding',
        '/ja/onboarding/',
        appRoutes.login('ja', parent),
        appRoutes.onboarding('ja', parent),
        appRoutes.login('ja', appRoutes.onboarding('ja', parent)),
        appRoutes.onboarding('ja', appRoutes.login('ja', parent)),
        '/ja/onboarding/extra',
        '/ja%2Fonboarding',
        '/ja\\onboarding',
      ])
        expect(WebPathSchema.safeParse(appRoutes[screen]('ja', unsafe)).success, unsafe).toBe(false);
    },
  );
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

describe('qs로 읽는 경로 쿼리', () => {
  it('인코딩해 다시 읽어도 같은 경로와 값이어야 한다', () => {
    const q = "호그 & 'ice' (덱)! a+b/c=d*e~f";
    const path = appRoutes.search('ko', { q });
    expect(resolveAppRoute(path)).toMatchObject({ path });
    expect(decodeURIComponent(path.split('?q=')[1] ?? '')).toBe(q);
    expect(appRoutes.feed('ko', { q: '수비 덱' })).toBe('/ko?q=%EC%88%98%EB%B9%84%20%EB%8D%B1');
  });

  it('빈 값은 쿼리에 넣지 않고 물음표도 남기지 않아야 한다', () => {
    expect(appRoutes.feed('ko', { q: '' })).toBe('/ko');
    expect(appRoutes.login('ko', '')).toBe('/ko/login');
    expect(appRoutes.boards('ko', 'free', '   ')).toBe('/ko/boards/free');
  });

  it('값 안의 대괄호와 등호를 키로 읽어 값을 숨기지 않아야 한다', () => {
    expect(WebPathSchema.parse('/ko?q=a]=b')).toBe('/ko?q=a%5D%3Db');
    for (const path of ['/ko/login?returnTo=//outside.test/]=x', '/ko?q=a&q=b]=c', '/ko?q=a%5D=b&q=c'])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });

  it('대괄호로 감싼 키도 같은 키로 검사해야 한다', () => {
    for (const path of ['/ko?[q]=a&q=b', '/ko/login?[returnTo]=//outside.test', '/ko?a[]=1&a[]=2'])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });

  it('제어 문자와 잘못된 인코딩은 무시되는 키에서도 경로 전체를 거부해야 한다', () => {
    for (const path of ['/ko?__proto__=%00', '/ko?%00=a', '/ko?utm=%XX', '/ko?a]=%0a'])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });

  it('구분자가 많아도 뒤의 값을 검사에서 빠뜨리지 않아야 한다', () => {
    for (const path of [
      `/ko?${'&'.repeat(1001)}q=%XX`,
      `/ko/login?${'&'.repeat(1001)}returnTo=//outside.test`,
    ])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });

  it('프로토타입 이름의 키가 라우팅 값에 섞이지 않아야 한다', () => {
    expect(WebPathSchema.parse('/ko?constructor=x&toString=y&q=hog')).toBe('/ko?q=hog');
  });
});
