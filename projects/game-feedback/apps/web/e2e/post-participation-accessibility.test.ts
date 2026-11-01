import { expect, test } from './support/test';

test('long post detail keeps labelled feedback and comment entries ahead of their lists', async ({
  page,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  const headers = { Origin: origin };
  expect(
    (await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } })).ok(),
  ).toBe(true);
  const created = await page.request.post('/api/posts', {
    headers,
    data: {
      title: '긴 상세에서도 참여 입력을 찾아요',
      body: '긴 본문을 읽은 뒤에도 피드백과 댓글 입력을 쉽게 찾을 수 있어야 합니다.\n'.repeat(60),
      board: 'FEEDBACK',
      categoryId: 'clash-royale',
    },
  });
  expect(created.ok()).toBe(true);
  const post = await created.json();
  expect(
    (await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-3' } })).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/posts/${post.id}/answers`, {
        headers,
        data: { body: '기존 피드백이 있어도 입력창은 목록보다 먼저 보여야 해요.' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/posts/${post.id}/comments`, {
        headers,
        data: { body: '기존 댓글보다 먼저 입력할 수 있어요.' },
      })
    ).ok(),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/ko/posts/${post.id}`);
  const feedback = page.getByRole('textbox', { name: '피드백 내용', exact: true });
  const comment = page.getByRole('textbox', { name: '댓글 내용', exact: true });
  await expect(feedback).toHaveCount(1);
  await expect(comment).toHaveCount(1);
  await expect(page.locator('.answer-compose label')).toContainText('피드백 내용');
  await feedback.scrollIntoViewIfNeeded();
  expect((await feedback.boundingBox())?.y).toBeLessThan(
    (await page.locator('.answer-card').first().boundingBox())?.y ?? 0,
  );
  await feedback.fill('실패해도 남아야 하는 피드백 초안이에요.');
  await expect(page.locator('.answer-compose label')).toContainText('10자 이상');
  const endpoint = `**/api/posts/${post.id}/answers`;
  await page.route(endpoint, (route) => route.abort('failed'));
  await page.getByRole('button', { name: '피드백 남기기', exact: true }).click();
  const error = page.locator('.answer-compose').getByRole('alert');
  await expect(error).toBeVisible();
  await expect(feedback).toHaveAttribute('aria-invalid', 'true');
  expect((await feedback.getAttribute('aria-describedby'))?.split(' ')).toContain(
    await error.getAttribute('id'),
  );
  await expect(feedback).toHaveValue('실패해도 남아야 하는 피드백 초안이에요.');
  await page.unroute(endpoint);
  await page.getByRole('button', { name: '피드백 남기기', exact: true }).click();
  await expect(feedback).toHaveValue('');
  await expect(error).toHaveCount(0);
  await page
    .locator('.answer-compose')
    .screenshot({ path: testInfo.outputPath('feedback-labelled-390.png') });

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await comment.scrollIntoViewIfNeeded();
    await expect(comment).toHaveAttribute('aria-describedby', /\S+/);
    expect((await comment.boundingBox())?.y).toBeLessThan(
      (await page.locator('.comment-thread').first().boundingBox())?.y ?? 0,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 430 });
  await comment.focus();
  await comment.scrollIntoViewIfNeeded();
  await expect(comment).toBeFocused();
  await expect(comment).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('comment-short-viewport-390.png') });
});
