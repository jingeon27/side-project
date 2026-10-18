import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';

for (const width of [400, 1440]) {
  test(`battle recruitment filters, prefills, saves and edits the battle type at ${width}px`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page.request.post('/api/auth/test-token', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    await page.goto('/ko/boards/friendly');
    await expect(page.getByRole('heading', { name: '전투 모집', exact: true })).toBeVisible();
    const filters = page.getByRole('navigation', { name: '전투 유형', exact: true });
    await filters.getByRole('link', { name: '팀전', exact: true }).click();
    await expect(page).toHaveURL(/battleMode=TEAM/);
    await expect(page.locator('.board-post-list:visible .battle-summary').first()).toHaveText('팀전');
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    await expect(page).toHaveURL(/\/write\?board=friendly&battleMode=TEAM$/);
    const editor = page.getByRole('form', { name: '글쓰기', exact: true });
    await expect(editor.getByRole('combobox', { name: '전투 유형', exact: true })).toHaveValue('TEAM');
    const title = `팀전 모집 ${width} ${Date.now().toString(36)}`;
    await editor.getByLabel('제목', { exact: true }).fill(title);
    await editor.getByRole('textbox', { name: '내용', exact: true }).fill('같이 전투할 분을 구해요.');
    await editor.getByRole('button', { name: '게시글 등록', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('.detail-card:visible .battle-summary')).toHaveText('팀전');
    const detailUrl = page.url();
    await page.reload();
    await page.locator('.detail-card:visible').getByRole('button', { name: '수정', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('combobox', { name: '전투 유형', exact: true })).toHaveValue('TEAM');
    await sheet.getByRole('combobox', { name: '전투 유형', exact: true }).selectOption('DUEL');
    await sheet.getByRole('button', { name: '수정 완료', exact: true }).click();
    await expect(sheet).not.toBeVisible();
    await expect(page.locator('.detail-card:visible .battle-summary')).toHaveText('1:1');
    const anonymous = await browser.newContext({ javaScriptEnabled: false });
    try {
      const document = await anonymous.newPage();
      await document.goto(detailUrl);
      await expect(document.locator('.detail-card .battle-summary')).toHaveText('1:1');
      await document.goto(`${origin}/ko/boards/friendly?battleMode=DUEL&q=${encodeURIComponent(title)}`);
      await expect(document.locator('.board-post-list .post-card')).toHaveCount(1);
      await expect(document.locator('.board-post-list .battle-summary')).toHaveText('1:1');
    } finally {
      await anonymous.close();
    }
    await page.goto('/ko/boards/friendly?battleMode=DUEL');
    await page.getByRole('banner').getByRole('link', { name: '검색', exact: true }).click();
    await page.getByRole('textbox', { name: '게시판 검색', exact: true }).fill(title);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.locator('.post-list:visible .post-card')).toHaveCount(1);
    await expect(page).toHaveURL(
      (url) => url.pathname === '/ko/search' && url.searchParams.get('battleMode') === 'DUEL',
    );
    await page.getByRole('link', { name: '돌아가기', exact: true }).click();
    await filters.getByRole('link', { name: '팀전', exact: true }).click();
    await expect(page.getByText('아직 게시글이 없어요. 첫 글을 남겨보세요.', { exact: true })).toBeVisible();
    await filters.getByRole('link', { name: '전체', exact: true }).click();
    await expect(page.locator('.board-post-list:visible .post-card')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
