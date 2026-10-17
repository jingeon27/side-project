import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3301';
test('community boards publish and edit Quill formatting, stay separate from feedback and render without JavaScript', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  const suffix = Date.now().toString(36);
  for (const slug of ['friend-sale', 'friendly']) {
    await page.goto(`/ko/boards/${slug}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://feedback.example/ko/boards/${slug}`,
    );
    const structuredData = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    );
    expect(structuredData['@type']).toBe('CollectionPage');
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '글쓰기', exact: true });
    const title = `${slug} 게시글 ${suffix}`;
    const body = `A detailed community listing for ${slug}. Please send a chat message to discuss the details.`;
    await editor.getByLabel('제목', { exact: true }).fill(title);
    const content = editor.getByRole('textbox', { name: '내용', exact: true });
    await content.fill(body);
    await content.press('ControlOrMeta+a');
    await editor.getByRole('button', { name: '굵게', exact: true }).click();
    await expect(content.locator('strong')).toContainText(body);
    await editor.getByRole('button', { name: '게시글 등록', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.locator('.game-board-navigation a[aria-current="page"]')).toHaveAttribute(
      'href',
      `/ko/boards/${slug}`,
    );
    await expect(page.locator('.prose-body strong')).toContainText(body);
    await expect(
      page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '피드', exact: true }),
    ).toHaveClass('active');
    expect((await page.request.get(`/api/posts?q=${encodeURIComponent(title)}`)).ok()).toBeTruthy();
    expect(
      (await (await page.request.get(`/api/posts?q=${encodeURIComponent(title)}`)).json()).items,
    ).toHaveLength(0);
    const url = page.url();
    await page.reload();
    await expect(page.locator('.prose-body strong')).toContainText(body);
    await expect(page.locator('.deck, .deck-card')).toHaveCount(0);
    await page.locator('.detail-card').getByRole('button', { name: '수정', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '게시글 수정', exact: true });
    await expect(edit.locator('.ql-editor strong')).toContainText(body);
    const updated = `${body} Updated details are available.`;
    await edit.getByRole('textbox', { name: '내용', exact: true }).fill(updated);
    await edit.getByRole('button', { name: '수정 완료', exact: true }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.locator('.prose-body')).toContainText(updated);
    const crawler = await browser.newContext({ javaScriptEnabled: false });
    try {
      const response = await (await crawler.newPage()).goto(url);
      expect(response?.status()).toBe(200);
      expect(await response?.text()).toContain(updated);
    } finally {
      await crawler.close();
    }
    await page.goto(`/ko/boards/${slug}`);
    await page.getByRole('textbox', { name: '게시판 검색' }).fill(suffix);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.locator('.board-post-list .post-card')).toHaveCount(1);
  }
});
test('every game contains five shared boards on desktop and mobile and retired board routes are unavailable', async ({
  page,
}) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko');
    const navigation = page.locator('.game-board-navigation');
    await expect(navigation.getByRole('link')).toHaveText([
      '전체 피드',
      '피드백',
      '친추판매',
      '친선전 모집',
      '게임코치',
      '자유게시판',
    ]);
    for (const [name, path] of [
      ['친추판매', '/ko/boards/friend-sale'],
      ['친선전 모집', '/ko/boards/friendly'],
      ['피드백', '/ko/boards/feedback'],
      ['게임코치', '/ko/boards/coaching'],
      ['자유게시판', '/ko/boards/free'],
      ['전체 피드', '/ko'],
    ]) {
      await navigation.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    if (width === 1440) {
      const sidebar = page.locator('.left-sidebar .game-submenu');
      await expect(sidebar.getByRole('link')).toHaveText([
        '피드백',
        '친추판매',
        '친선전 모집',
        '게임코치',
        '자유게시판',
      ]);
    }
    await expect(page.getByRole('link', { name: '계정 거래', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  for (const slug of ['account-trade', 'friends', 'marketplace']) {
    const response = await page.request.get(`/ko/boards/${slug}`);
    expect(response.status()).toBe(404);
  }
});
test('board tabs and Quill controls fit a small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-3' },
  });
  await page.goto('/ja/boards/friendly');
  await expect(page.getByRole('navigation', { name: 'モバイルメニュー' })).toBeVisible();
  await page.locator('.board-heading button').click();
  await expect(page.locator('.ql-editor')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const dialog = await page.getByRole('dialog').boundingBox();
  expect((dialog?.x ?? 0) + (dialog?.width ?? 0)).toBeLessThanOrEqual(321);
  await expect(page.locator('.deck')).toHaveCount(0);
});
