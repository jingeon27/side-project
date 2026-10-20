import { test, expect } from '@playwright/test';

test('composer examples follow the classification, battle type, coaching role and fee while keeping drafts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=friend-sale');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  const title = form.getByLabel('제목', { exact: true });
  const body = form.getByRole('textbox', { name: '내용', exact: true });
  const classification = form.getByLabel('분류', { exact: true });
  await expect(title).toHaveAttribute('placeholder', '예: 친구 추가 30일 이용권 판매합니다');
  await expect(form.getByLabel('판매 금액 (원)', { exact: true })).toHaveAttribute(
    'placeholder',
    '예: 15000',
  );
  await expect(body).toHaveAttribute(
    'data-placeholder',
    '친구 추가 이용 기간과 제공 내용, 가능한 인원, 거래 방식을 알려주세요.',
  );
  await title.fill('작성 중인 제목');
  await body.fill('작성 중인 본문을 유지합니다.');
  await classification.selectOption('FRIENDLY');
  await expect(title).toHaveAttribute('placeholder', '예: 오늘 저녁 9시에 1:1 연습하실 분');
  await form.getByLabel('전투 유형', { exact: true }).selectOption('TEAM');
  await expect(title).toHaveAttribute('placeholder', '예: 주말 저녁 팀전에 함께할 팀원 구해요');
  await expect(body).toHaveAttribute(
    'data-placeholder',
    '모집 인원과 역할, 함께할 시간, 참가 조건을 적어주세요.',
  );
  await classification.selectOption('COACHING');
  await expect(title).toHaveAttribute('placeholder', '예: 수비와 운영을 함께 연습할 수강생 모집');
  await form.getByLabel('모집 유형', { exact: true }).selectOption('STUDENT');
  await expect(title).toHaveAttribute('placeholder', '예: 목표 점수 달성까지 도와줄 코치 구해요');
  await expect(body).toHaveAttribute(
    'data-placeholder',
    '현재 실력과 목표, 배우고 싶은 내용, 가능한 시간과 예산을 알려주세요.',
  );
  await expect(form.getByLabel('시간당 희망 수강료 (원)', { exact: true })).toHaveAttribute(
    'placeholder',
    '예: 30000',
  );
  await form.getByLabel('수강료 기준', { exact: true }).selectOption('MONTHLY');
  await expect(form.getByLabel('월 희망 수강료 (원)', { exact: true })).toHaveAttribute(
    'placeholder',
    '예: 200000',
  );
  await form.getByLabel('수강료 기준', { exact: true }).selectOption('GOAL');
  await expect(form.getByLabel('목표 달성 희망 총 수강료 (원)', { exact: true })).toHaveAttribute(
    'placeholder',
    '예: 150000',
  );
  await classification.selectOption('FREE');
  await expect(title).toHaveAttribute('placeholder', '예: 이번 업데이트, 다들 어떻게 느끼셨나요?');
  await expect(body).toHaveAttribute(
    'data-placeholder',
    '공유하고 싶은 플레이 이야기나 질문을 편하게 남겨주세요.',
  );
  await expect(title).toHaveValue('작성 중인 제목');
  await expect(body).toHaveText('작성 중인 본문을 유지합니다.');
});

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
    await expect(page.getByRole('complementary', { name: '프로필 인증 안내' })).toBeVisible();
    if (width <= 760) await expect(page.locator('.mobile-nav:visible')).toHaveCount(0);
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
    await expect(page.getByRole('complementary', { name: '프로필 인증 안내' })).toBeVisible();
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
