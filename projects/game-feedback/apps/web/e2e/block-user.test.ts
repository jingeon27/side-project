import { randomUUID } from 'node:crypto';

import { expect, test } from './support/test';

const origin = 'http://127.0.0.1:3301';
const headers = { Origin: origin };

test('blocking a post author closes the confirmation and leaves the post before background reads finish', async ({
  page,
  browser,
}) => {
  const peer = await browser.newContext({ baseURL: origin });
  const reads = Promise.withResolvers<void>();
  try {
    await page.setViewportSize({ width: 393, height: 852 });
    const suffix = Date.now().toString(36);
    await page.request.post('/api/auth/demo', { headers, data: { nickname: `차단확인_${suffix}` } });
    const { user: author } = await (
      await peer.request.post('/api/auth/demo', { headers, data: { nickname: `차단상대_${suffix}` } })
    ).json();
    const categories = await (await peer.request.get('/api/categories')).json();
    const created = await peer.request.post('/api/posts', {
      headers,
      data: {
        title: '차단 후 화면 이동',
        body: '차단 결과를 확인할 게시글',
        board: 'FREE',
        categoryId: categories[0].id,
      },
    });
    expect(created.ok()).toBe(true);
    const post = await created.json();
    await page.goto('/ko');
    await expect(page.locator('.post-card').first()).toBeVisible();
    await page.goto(`/ko/posts/${post.id}?board=free`);
    const article = page.locator('.detail-card');
    await article.getByRole('button', { name: '차단', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(author.nickname);
    await page.route('**/api/blocks', (route) =>
      route.fulfill({ status: 503, json: { code: 'TEST_FAILURE', message: '차단 테스트 실패' } }),
    );
    await dialog.getByRole('button', { name: '차단하기', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('차단 테스트 실패');
    await expect(article).toBeVisible();
    await dialog.getByRole('button', { name: '돌아가기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
    expect(await (await page.request.get('/api/blocks')).json()).toHaveLength(0);
    await article.getByRole('button', { name: '차단', exact: true }).click();
    await page.route(`**/api/posts/${post.id}`, async (route) => {
      await reads.promise;
      await route.continue();
    });
    const blocked = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/blocks' && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: '차단하기', exact: true }).click();
    expect((await blocked).ok()).toBe(true);
    await expect(page).toHaveURL('/ko', { timeout: 2500 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toContainText('사용자를 차단했어요.');
    const blocks = await (await page.request.get('/api/blocks')).json();
    expect(blocks.some((user: { id: string }) => user.id === author.id)).toBe(true);
    await page.goto('/ko/settings');
    const blockedUser = page.locator('.blocked-user').filter({ hasText: author.nickname });
    await expect(blockedUser).toBeVisible();
    await blockedUser.getByRole('button', { name: '차단 해제', exact: true }).click();
    await expect(blockedUser).toHaveCount(0);
  } finally {
    reads.resolve();
    await page.unrouteAll({ behavior: 'wait' });
    await peer.close();
  }
});

test('blocking a chat peer returns to the inbox before message refresh completes', async ({
  page,
  browser,
}) => {
  const peer = await browser.newContext({ baseURL: origin });
  const reads = Promise.withResolvers<void>();
  try {
    const suffix = Date.now().toString(36);
    await page.request.post('/api/auth/demo', { headers, data: { nickname: `대화차단_${suffix}` } });
    const { user: author } = await (
      await peer.request.post('/api/auth/demo', { headers, data: { nickname: `대화상대_${suffix}` } })
    ).json();
    const conversation = await page.request.post('/api/conversations', {
      headers,
      data: { recipientId: author.id },
    });
    expect(conversation.ok()).toBe(true);
    const room = await conversation.json();
    expect(
      (
        await peer.request.post(`/api/conversations/${room.id}/messages`, {
          headers,
          data: { body: '차단 전에 받은 메시지', clientMessageId: randomUUID() },
        })
      ).ok(),
    ).toBe(true);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/ko/messages');
    await page.getByTestId(`conversation-${room.id}`).click();
    await expect(page.getByRole('textbox', { name: '메시지 내용', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '차단', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(author.nickname);
    await page.route(`**/api/conversations/${room.id}/messages*`, async (route) => {
      await reads.promise;
      await route.continue();
    });
    const blocked = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/blocks' && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: '차단하기', exact: true }).click();
    expect((await blocked).ok()).toBe(true);
    await expect(page).toHaveURL('/ko/messages', { timeout: 2500 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toContainText(
      '사용자를 차단했어요. 더 이상 메시지를 주고받을 수 없어요.',
    );
    await expect(page.getByTestId(`conversation-${room.id}`)).toHaveCount(0);
    expect([403, 404]).toContain((await page.request.get(`/api/conversations/${room.id}/messages`)).status());
    await expect(page.getByRole('alert', { name: '대화창 오류', exact: true })).toHaveCount(0);
    await page.screenshot({ path: '/tmp/gf-block-chat-success-393.png' });
  } finally {
    reads.resolve();
    await page.unrouteAll({ behavior: 'wait' });
    await peer.close();
  }
});

test('blocking a comment author hides their comment while keeping the current post usable', async ({
  page,
  browser,
}) => {
  const peer = await browser.newContext({ baseURL: origin });
  try {
    const suffix = Date.now().toString(36);
    await page.request.post('/api/auth/demo', { headers, data: { nickname: `댓글차단_${suffix}` } });
    await peer.request.post('/api/auth/demo', { headers, data: { nickname: `댓글상대_${suffix}` } });
    const categories = await (await page.request.get('/api/categories')).json();
    const post = await (
      await page.request.post('/api/posts', {
        headers,
        data: {
          title: '댓글 작성자 차단',
          body: '게시글은 계속 보여요.',
          board: 'FREE',
          categoryId: categories[0].id,
        },
      })
    ).json();
    await peer.request.post(`/api/posts/${post.id}/comments`, {
      headers,
      data: { body: '차단할 사용자의 댓글' },
    });
    await page.request.post(`/api/posts/${post.id}/comments`, {
      headers,
      data: { body: '내 댓글은 계속 보여요.' },
    });
    await page.goto(`/ko/posts/${post.id}?board=free`);
    const comment = page.locator('article.comment').filter({ hasText: '차단할 사용자의 댓글' });
    await comment.getByRole('button', { name: /댓글 메뉴$/ }).click();
    await page.getByRole('menuitem', { name: '차단', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '차단하기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(comment).toHaveCount(0);
    await expect(page.locator('.detail-card')).toBeVisible();
    await expect(page.locator('article.comment')).toContainText('내 댓글은 계속 보여요.');
    await expect(page).toHaveURL(`/ko/posts/${post.id}?board=free`);
    await expect(page.locator('[data-sonner-toast]')).toContainText('사용자를 차단했어요.');
    await expect(page.getByRole('alert', { name: '게시글 오류', exact: true })).toHaveCount(0);
  } finally {
    await peer.close();
  }
});
