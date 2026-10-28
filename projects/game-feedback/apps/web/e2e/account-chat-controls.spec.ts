import { randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext } from './support/test';

const origin = 'http://127.0.0.1:3301';
const headers = { Origin: origin };
async function choose(context: BrowserContext, accountId: string) {
  const response = await context.request.post('/api/auth/test-login', { headers, data: { accountId } });
  expect(response.ok(), await response.text()).toBe(true);
}

for (const width of [400, 1440]) {
  test(`language and appearance sections have consistent internal spacing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko/settings');
    for (const name of ['언어', '화면 모드']) {
      const section = page.getByRole('region', { name, exact: true });
      await expect(section.getByRole('heading')).toBeVisible();
      await expect(section.getByRole('combobox')).toBeVisible();
      const heading = await section.getByRole('heading').boundingBox();
      const control = await section.getByRole('combobox').boundingBox();
      expect(heading).toBeTruthy();
      expect(control).toBeTruthy();
      expect(Math.round((control?.y ?? 0) - (heading?.y ?? 0) - (heading?.height ?? 0))).toBe(16);
      expect(control?.height).toBeGreaterThanOrEqual(44);
    }
    const language = page.getByRole('region', { name: '언어', exact: true });
    const control = await language.getByRole('combobox').boundingBox();
    const help = await language.locator('.settings-help').boundingBox();
    expect(Math.round((help?.y ?? 0) - (control?.y ?? 0) - (control?.height ?? 0))).toBe(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/settings-spacing-${width}.png`, fullPage: true });
  });
}

test('verification encouragement opens the administrator chat and stays hidden for verified players', async ({
  page,
  context,
}) => {
  await choose(context, 'sample-user-0');
  await page.goto('/ko/write');
  await page.getByRole('button', { name: '프로필 인증 신청', exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/messages\/[^/]+$/);
  await expect(page.locator('.conversation-peer-meta')).toContainText('프로필 인증 문의');
  const roomId = new URL(page.url()).pathname.split('/').at(-1);
  const messages = await (await page.request.get(`/api/conversations/${roomId}/messages`)).json();
  expect(messages.conversation.supportTopic).toBe('VERIFICATION');
  await choose(context, 'sample-user-3');
  await page.goto('/ko/write');
  await expect(page.getByRole('form', { name: '글쓰기', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '프로필 인증 안내' })).toHaveCount(0);
});

test('chat reports a peer, preserves history on failure and deletes only the viewer history before receiving new messages', async ({
  browser,
}) => {
  const viewer = await browser.newContext({ baseURL: origin });
  const peer = await browser.newContext({ baseURL: origin });
  try {
    const suffix = Date.now().toString(36);
    const login = async (context: BrowserContext, nickname: string) => {
      const response = await context.request.post('/api/auth/demo', { headers, data: { nickname } });
      expect(response.ok()).toBe(true);
      return (await response.json()).user;
    };
    await login(viewer, `삭제확인_${suffix}`);
    const other = await login(peer, `삭제상대_${suffix}`);
    const room = await (
      await viewer.request.post('/api/conversations', { headers, data: { recipientId: other.id } })
    ).json();
    const first = await (
      await peer.request.post(`/api/conversations/${room.id}/messages`, {
        headers,
        data: { body: '삭제 전 대화', clientMessageId: randomUUID() },
      })
    ).json();
    const page = await viewer.newPage();
    await page.setViewportSize({ width: 400, height: 844 });
    await page.goto(`/ko/messages/${room.id}`);
    await expect(page.getByTestId(`message-${first.id}`)).toBeVisible();
    expect((await page.locator('.conversation-heading').boundingBox())?.height).toBeLessThanOrEqual(65);
    const actions = page.getByRole('group', { name: '대화 관리', exact: true });
    await expect(actions.getByRole('button', { name: '대화내역 삭제', exact: true })).toHaveCount(0);
    await expect(actions.getByRole('button', { name: '사용자 신고', exact: true })).toBeVisible();
    await actions.getByRole('button', { name: '사용자 신고', exact: true }).click();
    const report = page.getByRole('dialog');
    await expect(report.getByLabel('신고 사유', { exact: true })).toHaveValue('HARASSMENT');
    await report.getByLabel('신고 사유', { exact: true }).selectOption({ label: '사기 / 거래 피해' });
    await report.getByLabel('추가 설명 (선택)', { exact: true }).fill('채팅에서 사용자 신고');
    const reported = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/reports' && request.method() === 'POST',
    );
    await report.getByRole('button', { name: '신고 접수', exact: true }).click();
    expect((await reported).postDataJSON()).toMatchObject({
      targetType: 'USER',
      targetId: other.id,
      reason: 'FRAUD',
    });
    await expect(report).toHaveCount(0);
    await actions.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '대화내역 삭제', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toContainText('상대방의 내역은 유지');
    await confirmation.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.getByTestId(`message-${first.id}`)).toBeVisible();
    await actions.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '대화내역 삭제', exact: true }).click();
    await page.route(`**/api/conversations/${room.id}/messages`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'TEST_FAILURE', message: '삭제 테스트 실패' }),
      });
    });
    await confirmation.getByRole('button', { name: '대화내역 삭제', exact: true }).click();
    await expect(confirmation.getByRole('alert')).toContainText('삭제 테스트 실패');
    expect(
      (await (await viewer.request.get(`/api/conversations/${room.id}/messages`)).json()).items,
    ).toHaveLength(1);
    await page.unrouteAll({ behavior: 'wait' });
    await confirmation.getByRole('button', { name: '대화내역 삭제', exact: true }).click();
    await expect(page).toHaveURL('/ko/messages');
    await expect(page.locator('[data-sonner-toast]')).toContainText('대화내역을 삭제했어요.');
    expect(
      (await (await peer.request.get(`/api/conversations/${room.id}/messages`)).json()).items,
    ).toHaveLength(1);
    await expect(page.getByTestId(`conversation-${room.id}`)).toHaveCount(0);
    await peer.request.post(`/api/conversations/${room.id}/messages`, {
      headers,
      data: { body: '삭제 후 새 메시지', clientMessageId: randomUUID() },
    });
    const restored = page.getByTestId(`conversation-${room.id}`);
    await expect(restored).toBeVisible();
    await restored.click();
    await expect(page.getByRole('log')).toContainText('삭제 후 새 메시지');
    await expect(page.getByTestId(`message-${first.id}`)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await viewer.close();
    await peer.close();
  }
});
