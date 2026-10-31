import { expect, test } from './support/test';

for (const width of [390, 1280]) {
  test(`게시판별 작성·필터·목록을 ${width}px에서 직접 조립하고 서버 본문을 유지해야 한다`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const boards = [
      { slug: 'feedback', title: '피드백', filter: '답변 상태', action: '글쓰기' },
      { slug: 'friendly', title: '전투 모집', filter: '전투 유형', action: '글쓰기' },
      { slug: 'coaching', title: '게임코치', filter: '모집 유형', action: '코칭 등록' },
      { slug: 'friend-sale', title: '친추판매', filter: null, action: '글쓰기' },
      { slug: 'free', title: '자유게시판', filter: null, action: '글쓰기' },
    ];
    for (const board of boards) {
      await page.goto(`/ko/boards/${board.slug}`);
      await expect(page.getByRole('heading', { name: board.title, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: board.action, exact: true })).toBeVisible();
      for (const label of ['답변 상태', '전투 유형', '모집 유형']) {
        await expect(page.getByRole('navigation', { name: label, exact: true })).toHaveCount(
          label === board.filter ? 1 : 0,
        );
      }
      await expect(page.locator('.board-post-list')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 } });
    try {
      const document = await context.newPage();
      await document.goto('http://127.0.0.1:3301/ko/boards/friendly?battleMode=TEAM');
      await expect(document.locator('.board-post-list .post-card').first()).toBeVisible();
      await expect(document.locator('.board-post-list .battle-summary').first()).toHaveText('팀전');
    } finally {
      await context.close();
    }
  });
}

test('게시판·글쓰기·검색은 잘못된 필터 조합과 중복 입력을 거부해야 한다', async ({ request }) => {
  for (const path of [
    '/ko/boards/free?battleMode=TEAM',
    '/ko/boards/coaching?feedbackStatus=WAITING',
    '/ko/boards/friendly?coachingRole=COACH',
    '/ko/boards/friendly?battleMode=TEAM&battleMode=DUEL',
    '/ko/write?board=free&battleMode=TEAM',
    '/ko/write?board=friendly&coachingRole=COACH',
    '/ko/write?board=free&board=friendly',
    '/ko/search?board=free&coachingRole=COACH',
    '/ko/search?board=feedback&battleMode=TEAM',
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
