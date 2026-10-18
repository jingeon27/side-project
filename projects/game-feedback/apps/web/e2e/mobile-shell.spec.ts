import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';

for (const { width, locale, menu, actions } of [
  {
    width: 320,
    locale: 'ko',
    menu: ['홈', '가이드', '채팅', '프로필'],
    actions: ['언어 설정', '알림 0개', '검색'],
  },
  {
    width: 390,
    locale: 'en',
    menu: ['Home', 'Guide', 'Chat', 'Profile'],
    actions: ['Language settings', 'Notifications: 0', 'Search'],
  },
  {
    width: 760,
    locale: 'ja',
    menu: ['ホーム', 'ガイド', 'チャット', 'プロフィール'],
    actions: ['言語設定', 'お知らせ：0件', '検索'],
  },
]) {
  test(`${width}px mobile shell keeps its four tabs and accessible header actions in ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/${locale}`);
    const tabs = page.locator('.mobile-nav:visible');
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('link')).toHaveText(menu);
    await expect(tabs.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
    const header = page.getByRole('banner').locator('.header-actions');
    await expect(header.getByRole('link')).toHaveCount(2);
    await expect(header.getByRole('combobox')).toHaveCount(1);
    await expect(header.getByRole('button')).toHaveCount(0);
    for (const [index, name] of actions.entries()) {
      const link = header.getByRole(index === 0 ? 'combobox' : 'link', { name, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(header.locator('.notification-unread-indicator')).toHaveCount(0);
    await expect(tabs.locator('.mobile-chat-count')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const nextLocale = locale === 'en' ? 'ja' : 'en';
    await header.getByRole('combobox', { name: actions[0], exact: true }).click();
    await page.getByRole('option', { name: nextLocale === 'en' ? 'English' : '日本語', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${nextLocale}$`));
    await expect(page.locator('html')).toHaveAttribute('lang', nextLocale);
    await expect(header.getByRole('combobox')).toContainText(nextLocale === 'en' ? 'English' : '日本語');
    await expect(tabs.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
  });
}

test('mobile notification indicator and chat count follow persisted unread state and live read receipts', async ({
  browser,
}) => {
  const owner = await browser.newContext({ baseURL: origin, viewport: { width: 320, height: 844 } });
  const peer = await browser.newContext({ baseURL: origin });
  const suffix = Date.now().toString(36);
  try {
    const login = await owner.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname: `모바일작성자_${suffix}` },
    });
    expect(login.ok()).toBe(true);
    const { user } = await login.json();
    expect(
      (
        await peer.request.post('/api/auth/demo', {
          headers: { Origin: origin },
          data: { nickname: `모바일대화상대_${suffix}` },
        })
      ).ok(),
    ).toBe(true);
    const categories = await (await owner.request.get('/api/categories')).json();
    const created = await owner.request.post('/api/posts', {
      headers: { Origin: origin },
      data: {
        title: `모바일 소식 확인 ${suffix}`,
        body: '수비를 마치고 공격으로 전환하는 타이밍에 대한 의견을 구합니다.',
        categoryId: categories[0].id,
      },
    });
    expect(created.ok()).toBe(true);
    const post = await created.json();
    expect(
      (
        await peer.request.post(`/api/posts/${post.id}/answers`, {
          headers: { Origin: origin },
          data: { body: '상대의 수비 카드가 빠졌는지 확인하고 공격 타이밍을 정해보세요.' },
        })
      ).ok(),
    ).toBe(true);
    const roomResponse = await peer.request.post('/api/conversations', {
      headers: { Origin: origin },
      data: { recipientId: user.id },
    });
    expect(roomResponse.ok()).toBe(true);
    const room = await roomResponse.json();
    const sendMessage = async (body: string) => {
      const response = await peer.request.post(`/api/conversations/${room.id}/messages`, {
        headers: { Origin: origin },
        data: { body, clientMessageId: randomUUID() },
      });
      expect(response.ok()).toBe(true);
    };
    await sendMessage('공격으로 전환하는 타이밍을 같이 살펴볼까요?');
    await sendMessage('리플레이에서 어떤 부분이 가장 어려웠나요?');
    const page = await owner.newPage();
    const stream = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/chat/events' && response.ok(),
    );
    await page.goto('/ko');
    await stream;
    const header = page.getByRole('banner');
    const tabs = page.getByRole('navigation', { name: '모바일 메뉴' });
    const indicator = header.locator('.notification-unread-indicator');
    const count = tabs.locator('.mobile-chat-count');
    await expect(indicator).toBeVisible();
    await expect(count).toHaveText('2');
    await expect(tabs.getByRole('link', { name: '채팅 2개', exact: true })).toBeVisible();
    await header.getByRole('link', { name: '알림 1개', exact: true }).click();
    await page.getByRole('button', { name: '모두 읽음', exact: true }).click();
    await expect(header.getByRole('link', { name: '알림 0개', exact: true })).toBeVisible();
    await expect(indicator).toHaveCount(0);
    await expect(count).toHaveText('2');
    await tabs.getByRole('link', { name: '채팅 2개', exact: true }).click();
    await page.getByTestId(`conversation-${room.id}`).click();
    await expect(page.getByText('리플레이에서 어떤 부분이 가장 어려웠나요?', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '대화 목록으로 돌아가기', exact: true }).click();
    await expect(tabs.getByRole('link', { name: '채팅', exact: true })).toBeVisible();
    await expect(count).toHaveCount(0);
    await sendMessage('확인할 장면을 하나 더 보내드릴게요.');
    await expect(count).toHaveText('1');
    await expect(tabs.getByRole('link', { name: '채팅 1개', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(indicator).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await owner.close();
    await peer.close();
  }
});
