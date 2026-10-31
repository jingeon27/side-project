import { AnswerSchema, PostSchema, SessionSchema } from '@game-feedback/contracts';

import { expect, test } from './support/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';
const headers = { Origin: origin };

test('차단 답변의 집계는 JavaScript 없는 HTML에서도 개인화하고 공개 캐시와 분리해야 한다', async ({
  browser,
}) => {
  const writer = await browser.newContext({ baseURL: origin });
  const reviewer = await browser.newContext({ baseURL: origin });
  const viewer = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  const guest = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    for (const [context, accountId] of [
      [writer, 'sample-user-0'],
      [reviewer, 'sample-user-3'],
    ] as const)
      expect(
        (await context.request.post('/api/auth/test-token', { headers, data: { accountId } })).ok(),
      ).toBe(true);
    expect(
      (await viewer.request.post('/api/auth/demo', { headers, data: { nickname: 'SSR집계조회자' } })).ok(),
    ).toBe(true);
    const session = SessionSchema.parse(await (await reviewer.request.get('/api/session')).json());
    const reviewerId = session.user?.id;
    expect(reviewerId).toBeTruthy();
    const created = PostSchema.parse(
      await (
        await writer.request.post('/api/posts', {
          headers,
          data: {
            categoryId: 'clash-royale',
            title: '개인화 SSR 집계',
            body: '차단된 답변은 집계에서도 제외합니다.',
          },
        })
      ).json(),
    );
    const answer = AnswerSchema.parse(
      await (
        await reviewer.request.post(`/api/posts/${created.id}/answers`, {
          headers,
          data: { body: '공개 방문자에게만 보일 도움된 답변입니다.' },
        })
      ).json(),
    );
    expect(
      (
        await writer.request.post(`/api/answers/${answer.id}/helpful`, { headers, data: { helpful: true } })
      ).ok(),
    ).toBe(true);
    const publicPage = await guest.newPage();
    await publicPage.goto(`/ko/posts/${created.id}`);
    await expect(publicPage.locator('.status-pill')).toHaveText('도움됨');
    expect(
      (await viewer.request.post('/api/blocks', { headers, data: { blockedUserId: reviewerId } })).ok(),
    ).toBe(true);
    const privatePage = await viewer.newPage();
    await privatePage.goto(`/ko/posts/${created.id}`);
    await expect(privatePage.locator('.status-pill')).toHaveText('답변 대기');
    await expect(privatePage.getByText(answer.body, { exact: true })).toHaveCount(0);
    await publicPage.reload();
    await expect(publicPage.locator('.status-pill')).toHaveText('도움됨');
    await expect(publicPage.getByText(answer.body, { exact: true })).toBeVisible();
    expect((await viewer.request.get(`/internal/posts/${created.id}/answer-counts`)).status()).toBe(404);
  } finally {
    const session = SessionSchema.parse(await (await reviewer.request.get('/api/session')).json());
    if (session.user) await viewer.request.delete(`/api/blocks/${session.user.id}`, { headers });
    await Promise.all([writer.close(), reviewer.close(), viewer.close(), guest.close()]);
  }
});
