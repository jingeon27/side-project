import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:3304';
const headers = { Origin: origin };
test('anonymous and ordinary sessions do not expose administration and foreign origins cannot write', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '관리자 로그인이 필요합니다.' })).toBeVisible();
  expect(
    (
      await page.request.post('/api/auth/test-token', {
        headers: { Origin: 'https://foreign.example' },
        data: { accountId: 'sample-test-admin' },
      })
    ).status(),
  ).toBe(403);
  await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } });
  expect((await page.request.get('/api/admin/support')).status()).toBe(403);
  await page.reload();
  await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);
});

test('a failed support reply keeps its draft and retries with the same message ID', async ({
  page,
  browser,
}) => {
  const viewer = await browser.newContext({ baseURL: origin });
  try {
    const nickname = `재시도_${randomUUID().slice(0, 8)}`;
    await viewer.request.post('/api/auth/demo', {
      headers,
      data: { nickname },
    });
    const created = await viewer.request.post('/api/support/conversations', {
      headers,
      data: { topic: 'GENERAL' },
    });
    expect(created.ok()).toBe(true);
    const room = await created.json();
    const requests: string[] = [];
    await page.route(`**/api/conversations/${room.id}/messages`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requests.push(route.request().postDataJSON().clientMessageId);
      if (requests.length === 1) return route.abort('failed');
      return route.continue();
    });
    await page.goto('/');
    await page.getByRole('button', { name: '로컬 관리자 로그인', exact: true }).click();
    const thread = page.locator('[data-thread-id]').filter({ hasText: nickname });
    await thread.getByRole('link', { name: '문의 채팅 열기', exact: true }).click();
    const conversation = page.getByRole('region', { name: '문의 대화', exact: true });
    const input = conversation.getByRole('textbox', { name: '답변 내용', exact: true });
    const body = `다시 보낼 답변 ${randomUUID()}`;
    await input.fill(body);
    await conversation.getByRole('button', { name: '답변 보내기', exact: true }).click();
    await expect(conversation.getByRole('alert')).toBeVisible();
    await expect(input).toHaveValue(body);
    await conversation.getByRole('button', { name: '답변 보내기', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(conversation.getByRole('log').getByText(body, { exact: true })).toHaveCount(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
    const history = await (await viewer.request.get(`/api/conversations/${room.id}/messages`)).json();
    expect(history.items.filter((message: { body: string }) => message.body === body)).toHaveLength(1);
  } finally {
    await viewer.close();
  }
});

test('a failed report page preserves navigation and user deep links restore the search form', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '로컬 관리자 로그인', exact: true }).click();
  const menu = page.getByRole('navigation', { name: '관리자 메뉴' });
  await page.route('**/api/admin/reports', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Temporarily unavailable' }),
    }),
  );
  await menu.getByRole('link', { name: '신고함', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '정보를 불러오지 못했습니다.' })).toBeVisible();
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: '사용자 관리', exact: true }).click();
  await page.getByRole('textbox', { name: '사용자 ID', exact: true }).fill('sample-user-0');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByRole('article', { name: '사용자 관리' })).toContainText('새벽의호그');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '사용자 ID', exact: true })).toHaveValue('sample-user-0');
  await expect(page.getByRole('article', { name: '사용자 관리' })).toContainText('새벽의호그');
  await menu.getByRole('link', { name: '문의함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '문의함', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-support.png', fullPage: true });
});
test('a local administrator verifies users and applies and reverses a reasoned ban', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '로컬 관리자 로그인', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toBeVisible();
  await page.getByRole('link', { name: '사용자 관리', exact: true }).click();
  await page.getByRole('textbox', { name: '사용자 ID', exact: true }).fill('sample-user-0');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  const user = page.getByRole('article', { name: '사용자 관리' });
  await expect(user).toContainText('새벽의호그');
  await user.getByRole('button', { name: '프로필 인증 승인', exact: true }).click();
  await expect(user).toContainText('인증된 사용자');
  await user.getByRole('button', { name: '인증 해제', exact: true }).click();
  await expect(user).toContainText('미인증 사용자');
  await user.getByRole('textbox', { name: '제재 사유', exact: true }).fill('관리자 화면 제재 검증');
  await user.getByRole('button', { name: '사용자 밴', exact: true }).click();
  await expect(user.getByRole('status')).toContainText('이용 제한 중');
  await user.getByRole('textbox', { name: '제재 사유', exact: true }).fill('관리자 화면 제재 해제 검증');
  await user.getByRole('button', { name: '밴 해제', exact: true }).click();
  await expect(user.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: '관리자 로그인이 필요합니다.' })).toBeVisible();
});
test('the separate admin answers support chats, resolves inquiries and reviews reports', async ({
  page,
  browser,
}) => {
  const viewer = await browser.newContext({ baseURL: origin });
  try {
    await viewer.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } });
    const roomResponse = await viewer.request.post('/api/support/conversations', {
      headers,
      data: { topic: 'VERIFICATION' },
    });
    expect(roomResponse.ok(), await roomResponse.text()).toBe(true);
    const room = await roomResponse.json();
    const question = `프로필 확인 문의 ${randomUUID()}`;
    await viewer.request.post(`/api/conversations/${room.id}/messages`, {
      headers,
      data: { body: question, clientMessageId: randomUUID() },
    });
    const detail = `신고 검토 ${randomUUID()}`;
    await viewer.request.post('/api/reports', {
      headers,
      data: { targetType: 'USER', targetId: 'sample-user-3', reason: 'FRAUD', detail },
    });
    await page.goto('/');
    await page.getByRole('button', { name: '로컬 관리자 로그인', exact: true }).click();
    const thread = page
      .locator('[data-thread-id]')
      .filter({ hasText: '새벽의호그' })
      .filter({ hasText: '프로필 인증 문의' });
    await thread.getByRole('link', { name: '문의 채팅 열기', exact: true }).click();
    const conversation = page.getByRole('region', { name: '문의 대화', exact: true });
    await expect(conversation.getByRole('log')).toContainText(question);
    const answer = '게임 태그를 확인하고 인증 절차를 안내드릴게요.';
    for (const count of [1, 2]) {
      await conversation.getByRole('textbox', { name: '답변 내용', exact: true }).fill(answer);
      await conversation.getByRole('button', { name: '답변 보내기', exact: true }).click();
      await expect(conversation.getByRole('log').getByText(answer, { exact: true })).toHaveCount(count);
      await expect(conversation.getByRole('textbox')).toHaveValue('');
    }
    const messages = await (await viewer.request.get(`/api/conversations/${room.id}/messages`)).json();
    expect(messages.items.filter((message: { body: string }) => message.body === answer)).toHaveLength(2);
    await thread.getByRole('button', { name: '문의 처리 완료', exact: true }).click();
    await expect(thread).toContainText('처리 완료');
    await page
      .getByRole('navigation', { name: '관리자 메뉴' })
      .getByRole('link', { name: '신고함', exact: true })
      .click();
    const report = page.locator('[data-report-id]').filter({ hasText: detail });
    await report.getByRole('button', { name: '검토 완료', exact: true }).click();
    await expect(report.locator('p').filter({ hasText: '검토 완료' })).toBeVisible();
  } finally {
    await viewer.close();
  }
});
