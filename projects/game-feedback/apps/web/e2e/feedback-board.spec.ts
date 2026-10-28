import { appRoutes } from '@game-feedback/bridge';

import { adminApi } from './admin-api';
import { expect, test, type Page } from './support/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';

async function createFeedback(page: Page) {
  const q = `feedback-${Date.now().toString(36)}`;
  const game = q;
  const login = (accountId: string) =>
    page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId },
    });
  expect((await login('sample-test-admin')).ok()).toBe(true);
  const categoryResponse = await page.request.post(adminApi('/api/admin/categories'), {
    headers: { Origin: origin },
    data: { slug: game, name: '피드백 테스트 게임' },
  });
  expect(categoryResponse.ok()).toBe(true);
  const category = await categoryResponse.json();
  expect((await login('sample-user-0')).ok()).toBe(true);
  const posts: Array<{ id: string; title: string }> = [];
  for (const label of ['답변 대기 요청', '답변이 있는 요청']) {
    const created = await page.request.post('/api/posts', {
      headers: { Origin: origin },
      data: {
        categoryId: category.id,
        board: 'FEEDBACK',
        title: `${label} ${q}`,
        body: '수비 이후 공격으로 전환하는 타이밍을 알고 싶어요. 상대방의 자원과 카드 순환 중에서 무엇을 먼저 확인해야 할까요?',
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    posts.push(await created.json());
  }
  expect((await login('sample-user-3')).ok()).toBe(true);
  const [waiting, answered] = posts;
  if (!waiting || !answered) throw new Error('Feedback fixtures were not created.');
  const reply = await page.request.post(`/api/posts/${answered.id}/answers`, {
    headers: { Origin: origin },
    data: { body: '상대의 자원을 먼저 확인하고 핵심 수비 카드의 순환을 계산해보세요.' },
  });
  expect(reply.ok(), await reply.text()).toBe(true);
  await page.context().clearCookies();
  return { q, game, waiting, answered };
}

test('public feedback filters keep search, game and reply state through reload and detail navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 844 });
  const { q, game, waiting, answered } = await createFeedback(page);
  const board = appRoutes.boards('ko', 'feedback', q, game);
  await page.goto(board);
  const filters = page.getByRole('navigation', { name: '답변 상태', exact: true });
  const cards = page.locator('.board-post-list:visible .post-card');
  await expect(filters.getByRole('link')).toHaveText(['전체', '답변 대기', '답변 있음']);
  await expect(cards).toHaveCount(2);
  await expect(filters.getByRole('link', { name: '전체', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await filters.getByRole('link', { name: '답변 대기', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(waiting.title);
  await expect(cards.locator('.answer-count')).toHaveText('답변0');
  await filters.getByRole('link', { name: '답변 있음', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(answered.title);
  await expect(cards.locator('.answer-count')).toHaveText('답변1');
  const filtered = appRoutes.boards('ko', 'feedback', q, game, { feedbackStatus: 'ANSWERED' });
  await expect(page).toHaveURL(filtered);
  await cards.locator('.post-title-link').click();
  await expect(page.locator('.detail-card:visible')).toBeVisible();
  await page.locator('.back-link:visible').click();
  await expect(page).toHaveURL(filtered);
  await page.reload();
  await expect(filters.getByRole('link', { name: '답변 있음', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(cards).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://feedback.example/ko/boards/feedback?game=${game}`,
  );
  await page.getByRole('banner').getByRole('link', { name: '검색', exact: true }).click();
  await expect(page).toHaveURL(
    appRoutes.search('ko', { board: 'feedback', game, q, feedbackStatus: 'ANSWERED' }),
  );
  await page.getByRole('textbox', { name: '게시판 검색', exact: true }).fill(q);
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('.post-list:visible .post-card')).toHaveCount(1);
  await page.locator('.post-list:visible .post-title-link').click();
  await expect(page.locator('.detail-card:visible')).toBeVisible();
  await page.locator('.back-link:visible').click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/ko/search' && url.searchParams.get('feedbackStatus') === 'ANSWERED',
  );
  await page.getByRole('link', { name: '돌아가기', exact: true }).click();
  await expect(page).toHaveURL(filtered);
  for (const width of [320, 400, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(cards).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/game-feedback-feedback-${width}.png`, fullPage: true });
  }
});

test('filtered feedback is readable without JavaScript and empty filters can be cleared without losing scope', async ({
  page,
  browser,
}) => {
  const { q, game } = await createFeedback(page);
  const filtered = appRoutes.boards('ko', 'feedback', q, game, { feedbackStatus: 'WAITING' });
  const context = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    viewport: { width: 400, height: 844 },
  });
  try {
    const reader = await context.newPage();
    expect((await reader.goto(filtered))?.status()).toBe(200);
    await expect(reader.locator('.post-card')).toHaveCount(1);
    await expect(reader.locator('.status-pill')).toHaveText('답변 대기');
    await expect(
      reader
        .getByRole('navigation', { name: '답변 상태' })
        .getByRole('link', { name: '답변 대기', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  } finally {
    await context.close();
  }
  const emptyQuery = `${q}-missing`;
  await page.goto(appRoutes.boards('ko', 'feedback', emptyQuery, game, { feedbackStatus: 'ANSWERED' }));
  await expect(page.locator('.board-empty:visible')).toContainText('일치하는 게시글이 없어요');
  await page.getByRole('link', { name: '전체 피드백 보기', exact: true }).click();
  await expect(page).toHaveURL(appRoutes.boards('ko', 'feedback', emptyQuery, game));
  await expect(
    page.getByRole('navigation', { name: '답변 상태' }).getByRole('link', { name: '전체', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});
