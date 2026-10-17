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
    if (slug === 'friend-sale') await editor.getByLabel('판매 금액 (원)', { exact: true }).fill('12000');
    const content = editor.getByRole('textbox', { name: '내용', exact: true });
    await content.fill(body);
    await content.press('ControlOrMeta+a');
    await editor.getByRole('button', { name: '굵게', exact: true }).click();
    await expect(content.locator('strong')).toContainText(body);
    await editor.getByRole('button', { name: '게시글 등록', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.locator('.left-sidebar .game-submenu a[aria-current="page"]')).toHaveAttribute(
      'href',
      `/ko/boards/${slug}`,
    );
    await expect(page.locator('.prose-body strong')).toContainText(body);
    if (slug === 'friend-sale') await expect(page.locator('.friend-sale-summary')).toContainText('12,000');
    const url = page.url();
    await page.goto(`/ko/boards/feedback?q=${encodeURIComponent(title)}`);
    await expect(page.getByText('아직 게시글이 없어요. 첫 글을 남겨보세요.', { exact: true })).toBeVisible();
    await expect(page.locator('.board-post-list .post-card')).toHaveCount(0);
    await page.goto(url);
    await page.reload();
    await expect(page.locator('.prose-body strong')).toContainText(body);
    await expect(page.locator('.deck, .deck-card')).toHaveCount(0);
    await page.locator('.detail-card').getByRole('button', { name: '수정', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '게시글 수정', exact: true });
    await expect(edit.locator('.ql-editor strong')).toContainText(body);
    if (slug === 'friend-sale') {
      await expect(edit.getByLabel('판매 금액 (원)', { exact: true })).toHaveValue('12000');
      await edit.getByLabel('판매 금액 (원)', { exact: true }).fill('18000');
    }
    const updated = `${body} Updated details are available.`;
    await edit.getByRole('textbox', { name: '내용', exact: true }).fill(updated);
    await edit.getByRole('button', { name: '수정 완료', exact: true }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.locator('.prose-body')).toContainText(updated);
    if (slug === 'friend-sale') await expect(page.locator('.friend-sale-summary')).toContainText('18,000');
    const crawler = await browser.newContext({ javaScriptEnabled: false });
    try {
      const response = await (await crawler.newPage()).goto(url);
      expect(response?.status()).toBe(200);
      const html = await response?.text();
      expect(html).toContain(updated);
      if (slug === 'friend-sale') expect(html).toContain('18,000');
    } finally {
      await crawler.close();
    }
    await page.goto(`/ko/boards/${slug}`);
    await page.getByRole('textbox', { name: '게시판 검색' }).fill(suffix);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.locator('.board-post-list .post-card')).toHaveCount(1);
    if (slug === 'friend-sale') {
      await expect(page.locator('.post-card .friend-sale-summary')).toContainText('18,000');
      await page.goto(`/ko?q=${suffix}`);
      await expect(page.locator('.post-card .friend-sale-summary')).toContainText('18,000');
    }
  }
});
test('every game contains five shared boards on desktop and mobile and retired board routes are unavailable', async ({
  page,
}) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko');
    const desktop = width > 760;
    const navigation = desktop ? page.locator('.left-sidebar') : page.locator('.game-board-navigation');
    const boards = navigation.locator(desktop ? '.game-submenu' : '.game-board-chips');
    await expect(boards.getByRole('link')).toHaveText([
      ...(desktop ? [] : ['전체 피드']),
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
    ] as const) {
      const link = navigation.getByRole('link', {
        name: desktop && name === '전체 피드' ? '피드' : name,
        exact: true,
      });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(link).toHaveAttribute('aria-current', 'page');
      if (!desktop) {
        await expect(link).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    }
    await expect(page.getByRole('link', { name: '계정 거래', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  for (const slug of ['account-trade', 'friends', 'marketplace']) {
    const response = await page.request.get(`/ko/boards/${slug}`);
    expect(response.status()).toBe(404);
  }
});
test('category chips support direct links, keyboard navigation, short viewports and Quill context', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-3' },
  });
  await page.goto('/ja/boards/friendly');
  await expect(page.getByRole('navigation', { name: 'モバイルメニュー' })).toBeVisible();
  const chips = page.locator('.game-board-chips');
  const friendly = chips.locator('a[href="/ja/boards/friendly"]');
  await expect(friendly).toHaveAttribute('aria-current', 'page');
  await expect(friendly).toBeInViewport({ ratio: 1 });
  expect(await chips.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  const length = await page.evaluate(() => history.length);
  await friendly.focus();
  await page.keyboard.press('Tab');
  const coaching = chips.locator('a[href="/ja/boards/coaching"]');
  await expect(coaching).toBeFocused();
  await expect(coaching).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/ja/boards/coaching');
  await expect(coaching).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.reload();
  await expect(coaching).toHaveAttribute('aria-current', 'page');
  await expect(coaching).toBeInViewport({ ratio: 1 });
  await chips.getByRole('link').last().click();
  await expect(page).toHaveURL('/ja/boards/free');
  await page.setViewportSize({ width: 400, height: 360 });
  await expect(chips.getByRole('link').last()).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await chips
      .getByRole('link')
      .evaluateAll(
        (links) => new Set(links.map((link) => Math.round(link.getBoundingClientRect().top))).size,
      ),
  ).toBe(1);
  await chips.getByRole('link').first().focus();
  await expect(chips.getByRole('link').first()).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 760, height: 844 });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(chips.getByRole('link').last()).toBeInViewport({ ratio: 1 });
  await friendly.click();
  await expect(page).toHaveURL('/ja/boards/friendly');
  await page.locator('.board-heading button').click();
  await expect(page.locator('.ql-editor')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '分類', exact: true })).toHaveValue('FRIENDLY');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const dialog = await page.getByRole('dialog').boundingBox();
  expect((dialog?.x ?? 0) + (dialog?.width ?? 0)).toBeLessThanOrEqual(321);
  await expect(page.locator('.deck')).toHaveCount(0);
});

test('mobile composition can switch categories from a board and persist friend sale prices', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/en/boards/friendly');
  await page.getByRole('button', { name: 'Write a post', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Write a post', exact: true });
  const category = editor.getByRole('combobox', { name: 'Category', exact: true });
  await expect(category).toHaveValue('FRIENDLY');
  const body = 'Please contact me in chat to agree on the price and duration of this friend slot.';
  await editor.getByRole('textbox', { name: 'Content', exact: true }).fill(body);
  await category.selectOption('FRIEND_SALE');
  const price = editor.getByLabel('Sale price (KRW)', { exact: true });
  await expect(price).toHaveAttribute('inputmode', 'numeric');
  await price.fill('0');
  // An inactive board's invalid fee must not block the new board's valid form.
  await editor.getByLabel('Category', { exact: true }).selectOption('FREE');
  await expect(price).toHaveCount(0);
  await editor.getByLabel('Category', { exact: true }).selectOption('FRIEND_SALE');
  await expect(price).toHaveValue('');
  const title = `Mobile friend slot sale ${Date.now().toString(36)}`;
  await editor.getByLabel('Title', { exact: true }).fill(title);
  await expect(editor.getByRole('textbox', { name: 'Content', exact: true })).toContainText(body);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await editor.getByRole('button', { name: 'Publish post', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.locator('.friend-sale-summary')).toContainText('Price negotiable');
  await expect(page).toHaveURL(/board=friend-sale$/);
  await expect(page.locator('.back-link')).toHaveAttribute('href', '/en/boards/friend-sale');
  await page.reload();
  await expect(page.locator('.friend-sale-summary')).toContainText('Price negotiable');
  await page.locator('.detail-card').getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit post', exact: true });
  await edit.getByLabel('Sale price (KRW)', { exact: true }).fill('25000');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.friend-sale-summary')).toContainText('25,000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
