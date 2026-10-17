import { test, expect } from '@playwright/test';

for (const width of [320, 1440]) {
  test(`a dedicated editor accepts a one-character body, keeps failed drafts and returns to the feed at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: 'http://127.0.0.1:3301' },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto('/ko?q=hog&tab=unanswered');
    await page.locator('.feed-heading').getByRole('button', { name: '글쓰기', exact: true }).click();
    await expect(page).toHaveURL('/ko/write');
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width <= 760) await expect(page.locator('.mobile-nav')).toBeHidden();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const form = page.getByRole('form', { name: '글쓰기', exact: true });
    const title = `짧은 글쓰기 ${width} ${Date.now().toString(36)}`;
    await form.getByLabel('분류', { exact: true }).selectOption('FREE');
    await form.getByLabel('제목', { exact: true }).fill(title);
    await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
    await expect(
      form.getByText('내용을 입력해주세요. 최대 10,000자까지 작성할 수 있어요.', { exact: true }),
    ).toBeVisible();
    await form.getByRole('textbox', { name: '내용', exact: true }).fill('안');
    await page.route('**/api/posts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'TEST_FAILURE', message: '테스트 등록 실패' }),
      });
    });
    await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('테스트 등록 실패');
    await expect(form.getByLabel('제목', { exact: true })).toHaveValue(title);
    await expect(form.getByRole('textbox', { name: '내용', exact: true })).toHaveText('안');
    await page.unrouteAll({ behavior: 'wait' });
    const creation = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/posts' && response.request().method() === 'POST',
    );
    await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
    const response = await creation;
    expect(response.ok()).toBe(true);
    const post = await response.json();
    expect(post.body).toBe('안');
    await expect(page).toHaveURL(
      (url) => url.pathname === `/ko/posts/${post.id}` && url.searchParams.get('board') === 'free',
    );
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();
    await page.reload();
    await expect(page.locator('.prose-body')).toHaveText('안');
    expect((await (await page.request.get(`/api/posts/${post.id}`)).json()).post.body).toBe('안');
    await page.goBack();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/ko' &&
        url.searchParams.get('q') === 'hog' &&
        url.searchParams.get('tab') === 'unanswered',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
