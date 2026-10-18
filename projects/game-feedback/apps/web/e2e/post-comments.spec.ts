import { expect, test } from '@playwright/test';
import type { PostDetail } from '@game-feedback/contracts';

const origin = 'http://127.0.0.1:3301';
const headers = { Origin: origin };

test('public comments identify the post author and remain readable on mobile and without JavaScript', async ({
  page,
  browser,
}) => {
  const detail = (await (await page.request.get('/api/posts/sample-post-0')).json()) as PostDetail;
  const ownComment = detail.comments.find((comment) => comment.author.id === detail.post.author.id);
  if (!ownComment) throw new Error('The public fixture must include a comment from the post author.');
  await page.goto('/ko/posts/sample-post-0');
  const comments = page.getByRole('region', { name: /^댓글/ });
  await expect(comments.getByRole('heading', { level: 2 })).toHaveText(`댓글${detail.comments.length}`);
  await expect(comments.getByRole('listitem')).toHaveCount(detail.comments.length);
  const authorComment = comments.locator('article').filter({ hasText: ownComment.body });
  await expect(authorComment.locator('.comment-author-label')).toHaveText('작성자');
  await expect(authorComment.locator('time')).toHaveAttribute('datetime', ownComment.createdAt);
  await expect(comments.getByRole('button', { name: '로그인하고 댓글 남기기', exact: true })).toBeVisible();
  await expect(page.locator('.detail-contact-action')).toContainText(detail.post.author.nickname);
  await expect(page.locator('.detail-contact-action button')).toHaveText('작성자와 1:1 채팅');
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    await comments.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const date of await comments.locator('time').all()) {
      expect(await date.evaluate((node) => node.getClientRects().length)).toBe(1);
    }
    expect(
      await page
        .locator('.detail-contact-action button')
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: `/tmp/gf-comments-${width}.png`, fullPage: true });
  }

  const crawler = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    const reader = await crawler.newPage();
    await reader.goto('/ko/posts/sample-post-0');
    for (const comment of detail.comments) {
      await expect(reader.locator('.comment-content > p').filter({ hasText: comment.body })).toBeVisible();
    }
    await expect(reader.locator('.comment-author-label')).toHaveText('작성자');
  } finally {
    await crawler.close();
  }

  for (const [locale, chatLabel, authorLabel] of [
    ['en', 'Chat with the author', 'Author'],
    ['ja', '投稿者と1対1チャット', '投稿者'],
  ] as const) {
    await page.goto(`/${locale}/posts/sample-post-0`);
    await expect(page.locator('.detail-contact-action button')).toHaveText(chatLabel);
    await expect(page.locator('.comment-author-label')).toHaveText(authorLabel);
  }
});

test('comment drafts support line breaks and author chat opens the correct conversation', async ({
  page,
}) => {
  await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } });
  const categories = await (await page.request.get('/api/categories')).json();
  const created = await page.request.post('/api/posts', {
    headers,
    data: {
      title: '댓글과 작성자 채팅',
      body: '자유롭게 이야기해요.',
      board: 'FREE',
      categoryId: categories[0].id,
    },
  });
  expect(created.ok()).toBe(true);
  const post = await created.json();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/ko/posts/${post.id}?board=free`);
  await expect(page.locator('.detail-contact-action')).toHaveCount(0);
  await expect(page.getByText('아직 댓글이 없어요.', { exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: '댓글 내용', exact: true });
  await expect(input).toHaveJSProperty('tagName', 'TEXTAREA');
  await input.fill('첫 번째 줄');
  await input.press('Enter');
  await input.pressSequentially('두 번째 줄');
  await expect(input).toHaveValue('첫 번째 줄\n두 번째 줄');
  await expect(page.locator('article.comment')).toHaveCount(0);
  const commentEndpoint = `**/api/posts/${post.id}/comments`;
  await page.route(commentEndpoint, (route) => route.abort('failed'));
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(page.locator('.comment-form').getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('첫 번째 줄\n두 번째 줄');
  await expect(page.locator('.detail-card')).toBeVisible();
  await page.unroute(commentEndpoint);
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(page.locator('.comment-content > p')).toHaveText('첫 번째 줄\n두 번째 줄');
  await expect(page.locator('.comment-author-label')).toHaveText('작성자');
  await expect(page.getByText('아직 댓글이 없어요.', { exact: true })).toHaveCount(0);
  await expect(input).toHaveValue('');
  await expect(page.locator('.comment-form').getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/gf-comment-composer-393.png', fullPage: true });

  await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-3' } });
  await page.reload();
  await page.locator('.detail-contact-action').getByRole('button').click();
  await expect(page).toHaveURL('/ko/messages/sample-conversation-0-3');
  await expect(page.locator('.conversation-heading:visible')).toContainText('새벽의호그');
});
