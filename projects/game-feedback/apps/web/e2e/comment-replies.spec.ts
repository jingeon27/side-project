import { CommentSchema, NotificationListSchema, PostSchema, SessionSchema } from '@game-feedback/contracts';

import { expect, test, type APIRequestContext } from './support/test';

async function signIn(request: APIRequestContext, nickname: string, origin: string) {
  const response = await request.post('/api/auth/demo', { headers: { Origin: origin }, data: { nickname } });
  expect(response.ok()).toBe(true);
  const { user } = SessionSchema.parse(await response.json());
  if (!user) throw new Error('Expected an authenticated comment fixture.');
  return user;
}
async function createPost(request: APIRequestContext, origin: string) {
  const response = await request.post('/api/posts', {
    headers: { Origin: origin },
    data: {
      title: '답글로 이어지는 대화',
      body: '댓글 아래에서 대화를 이어가요.',
      board: 'FREE',
      categoryId: 'clash-royale',
    },
  });
  expect(response.ok()).toBe(true);
  return PostSchema.parse(await response.json());
}

test('mobile readers can reply, retry their draft, edit, and preserve replies after the parent is deleted', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const suffix = Date.now().toString(36);
  const parentName = `원댓글_${suffix}`;
  const replyName = `답글_${suffix}`;
  await signIn(page.request, parentName, origin);
  const post = await createPost(page.request, origin);
  const path = `/ko/posts/${post.id}?board=free`;
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(path);
  await page.getByRole('textbox', { name: '댓글 내용', exact: true }).fill('답글을 달아 주세요.');
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  const thread = page.locator('.comment-thread');
  await expect(thread.locator('.comment-bubble')).toHaveText('답글을 달아 주세요.');
  await signIn(page.request, replyName, origin);
  await page.reload();
  await thread.getByRole('button', { name: '답글', exact: true }).click();
  const input = page.getByRole('textbox', { name: '답글 내용', exact: true });
  await expect(input).toBeFocused();
  await input.fill('첫 줄 답글');
  await input.press('Enter');
  await input.pressSequentially('두 번째 줄');
  const endpoint = `**/api/posts/${post.id}/comments`;
  await page.route(endpoint, (route) => route.abort('failed'));
  await page.getByRole('button', { name: '답글 등록', exact: true }).click();
  await expect(page.locator('.comment-reply-form').getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('첫 줄 답글\n두 번째 줄');
  await page.unroute(endpoint);
  await page.getByRole('button', { name: '답글 등록', exact: true }).click();
  const replies = thread.getByRole('list', { name: '답글', exact: true });
  await expect(replies.locator('.comment-bubble')).toHaveText(`@${parentName} 첫 줄 답글\n두 번째 줄`);
  await expect(replies.locator('[data-slot="mention"]')).toHaveText(`@${parentName}`);
  await expect(replies.locator('[data-slot="mention"]')).toHaveCSS('border-top-width', '1px');
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^댓글\s*2$/ })).toBeVisible();
  await expect(replies.getByRole('button', { name: '답글', exact: true })).toHaveCount(0);

  await replies.getByRole('button', { name: '수정', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '댓글 수정', exact: true });
  await edit.getByRole('textbox', { name: '수정 내용', exact: true }).fill('수정한 답글입니다.');
  await edit.getByRole('button', { name: '수정 완료', exact: true }).click();
  await expect(replies.locator('.comment-bubble')).toHaveText(`@${parentName} 수정한 답글입니다.`);
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.comments-section').screenshot({ path: testInfo.outputPath('reply-mobile.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(replies.locator('.comment-bubble')).toHaveCSS('color', 'rgb(244, 241, 235)');
  await page.locator('.comments-section').screenshot({ path: testInfo.outputPath('reply-mobile-dark.png') });

  await signIn(page.request, parentName, origin);
  await page.reload();
  await thread.locator(':scope > article').getByRole('button', { name: '삭제', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '정말 삭제할까요?', exact: true });
  await expect(confirmation).toContainText('댓글을 삭제해도 다른 사람이 남긴 답글은 유지됩니다.');
  await confirmation.getByRole('button', { name: '삭제하기', exact: true }).click();
  await expect(thread.locator('.comment-deleted')).toHaveText('삭제된 댓글이에요.');
  await expect(thread.locator('.comment-deleted a')).toHaveCount(0);
  await expect(replies.locator('.comment-bubble')).toHaveText('수정한 답글입니다.');
  await expect(page.getByRole('heading', { name: /^댓글\s*1$/ })).toBeVisible();

  const crawler = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    const reader = await crawler.newPage();
    await reader.goto(path);
    await expect(reader.locator('.comment-deleted')).toHaveText('삭제된 댓글이에요.');
    await expect(reader.locator('.comment-replies .comment-bubble')).toHaveText('수정한 답글입니다.');
    const data = await reader.locator('script[type="application/ld+json"]').allTextContents();
    const discussion = data
      .map((text) => JSON.parse(text))
      .find((item) => item['@type'] === 'DiscussionForumPosting');
    expect(discussion?.commentCount).toBe(1);
    expect(discussion?.comment).toHaveLength(1);
  } finally {
    await crawler.close();
  }
  await signIn(page.request, replyName, origin);
  await page.reload();
  await replies.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제하기', exact: true }).click();
  await expect(thread).toHaveCount(0);
  await expect(page.getByText('아직 댓글이 없어요.', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('blocking a parent hides the entire thread in both the API and cached HTML', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  const headers = { Origin: origin };
  const suffix = Date.now().toString(36);
  await signIn(page.request, `게시자_${suffix}`, origin);
  const post = await createPost(page.request, origin);
  const parentAuthor = await signIn(page.request, `댓글작성자_${suffix}`, origin);
  const rootResponse = await page.request.post(`/api/posts/${post.id}/comments`, {
    headers,
    data: { body: '차단할 원댓글' },
  });
  expect(rootResponse.ok()).toBe(true);
  const parent = CommentSchema.parse(await rootResponse.json());
  const viewerName = `답글작성자_${suffix}`;
  await signIn(page.request, viewerName, origin);
  expect(
    (
      await page.request.post(`/api/posts/${post.id}/comments`, {
        headers,
        data: { body: '원댓글에 연결된 답글', parentId: parent.id },
      })
    ).ok(),
  ).toBe(true);
  const path = `/ko/posts/${post.id}?board=free`;
  await page.goto(path);
  await expect(page.locator('.comment-replies .comment-bubble')).toHaveText(
    `@댓글작성자_${suffix} 원댓글에 연결된 답글`,
  );
  expect(
    (await page.request.post('/api/blocks', { headers, data: { blockedUserId: parentAuthor.id } })).ok(),
  ).toBe(true);
  const filtered = await (await page.request.get(`/api/posts/${post.id}`)).json();
  expect(filtered.comments).toEqual([]);
  const crawler = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    await signIn(crawler.request, viewerName, origin);
    const reader = await crawler.newPage();
    await reader.goto(path);
    await expect(reader.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
    await expect(reader.locator('.comment-thread')).toHaveCount(0);
    await expect(reader.getByText('아직 댓글이 없어요.', { exact: true })).toBeVisible();
  } finally {
    await crawler.close();
    await page.request.delete(`/api/blocks/${parentAuthor.id}`, { headers });
  }
});

test('a reply notifies both authors, updates unread counts and opens the exact reply when read', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  const headers = { Origin: origin };
  const author = await browser.newContext({ baseURL: origin });
  const parent = await browser.newContext({ baseURL: origin });
  try {
    const suffix = Date.now().toString(36);
    await signIn(author.request, `알림게시자_${suffix}`, origin);
    const post = await createPost(author.request, origin);
    await signIn(parent.request, `알림원댓글_${suffix}`, origin);
    const rootResponse = await parent.request.post(`/api/posts/${post.id}/comments`, {
      headers,
      data: { body: '답글 알림을 받을 원댓글입니다.' },
    });
    expect(rootResponse.ok()).toBe(true);
    const root = CommentSchema.parse(await rootResponse.json());
    const replyName = `알림답글_${suffix}`;
    await signIn(page.request, replyName, origin);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`/ko/posts/${post.id}`);
    await page
      .locator(`#comment-${root.id}`)
      .locator('..')
      .getByRole('button', { name: '답글', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: '답글 내용', exact: true })
      .fill('새 답글을 알림으로 확인해 보세요.');
    // 분류 주소로 바뀌어도 화면을 다시 받지 않아 작성 중인 답글이 남아야 한다.
    await expect(page).toHaveURL(`/ko/posts/${post.id}?board=free`);
    await expect(page.getByRole('textbox', { name: '답글 내용', exact: true })).toHaveValue(
      '새 답글을 알림으로 확인해 보세요.',
    );
    await page.getByRole('button', { name: '답글 등록', exact: true }).click();
    await expect(page.locator('.comment-replies .comment-bubble')).toHaveText(
      `@알림원댓글_${suffix} 새 답글을 알림으로 확인해 보세요.`,
    );
    const inbox = NotificationListSchema.parse(await (await parent.request.get('/api/notifications')).json());
    expect(inbox.unreadCount).toBe(1);
    const notification = inbox.items.find((item) => item.type === 'COMMENT_REPLY');
    if (!notification?.commentId) throw new Error('Reply notification must identify the comment.');
    const authorInbox = NotificationListSchema.parse(
      await (await author.request.get('/api/notifications')).json(),
    );
    expect(authorInbox.items.filter((item) => item.type === 'COMMENT_REPLY')).toHaveLength(1);
    const actorInbox = NotificationListSchema.parse(
      await (await page.request.get('/api/notifications')).json(),
    );
    expect(actorInbox.items).toHaveLength(0);

    const inboxPage = await parent.newPage();
    await inboxPage.setViewportSize({ width: 393, height: 852 });
    await inboxPage.goto('/ko/notifications');
    const row = inboxPage.locator('.notification-item').filter({ hasText: replyName });
    await expect(row).toContainText('새로운 답글이 달렸어요');
    await expect(row).toHaveAttribute('data-unread');
    await expect(row).toHaveAttribute('href', `/ko/posts/${post.id}#comment-${notification.commentId}`);
    await row.click();
    await expect(inboxPage).toHaveURL(
      origin + `/ko/posts/${post.id}?board=free#comment-${notification.commentId}`,
    );
    await expect(inboxPage.locator(`#comment-${notification.commentId}`)).toBeInViewport();
    await expect
      .poll(
        async () =>
          NotificationListSchema.parse(await (await parent.request.get('/api/notifications')).json())
            .unreadCount,
      )
      .toBe(0);
  } finally {
    await Promise.all([author.close(), parent.close()]);
  }
});
