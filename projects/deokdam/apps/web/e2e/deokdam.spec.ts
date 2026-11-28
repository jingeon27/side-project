import { expect, test } from '@playwright/test';

import { findEpisode } from '../src/shared/episodes';
import { signInFixture } from './account-fixture';

const episodePath = '/cards/baek-beonjjae-jiwonseo';
const action = '친구와 자기소개서 첫 줄을 서로 읽어주기';

test('the postcard renders its original message before scripts arrive and preserves the first edit', async ({
  page,
  context,
}) => {
  const episode = findEpisode('baek-beonjjae-jiwonseo');
  if (!episode) throw new Error('Expected published postcard');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const hydration = Promise.withResolvers<void>();
  await page.route(
    (url) => url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js'),
    async (route) => {
      await hydration.promise;
      await route.continue();
    },
  );
  await page.goto(episodePath, { waitUntil: 'commit' });
  const editor = page.getByLabel('내 말투로 바꿔 보내기');
  try {
    await expect(editor).toHaveValue(episode.message);
    await expect(editor).not.toBeEditable();
  } finally {
    hydration.resolve();
  }
  await expect(editor).toBeEditable();
  const firstEdit = '첫 줄부터 천천히 같이 읽어볼까?';
  await editor.fill(firstEdit);
  await page.getByRole('button', { name: '문장 복사' }).click();
  await expect(page.getByText('복사했어요. 원하는 곳에 붙여 넣으세요.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstEdit);
});

test('a Shorts visitor can open the published card, save one action and choose what to share', async ({
  page,
  context,
}) => {
  await signInFixture(context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(episodePath + '?utm_source=youtube');
  await expect(page.getByRole('heading', { name: '백 번째 지원서' })).toBeVisible();
  await expect(page.getByRole('heading', { name: action })).toBeVisible();
  await page.getByLabel('내 말투로 바꿔 보내기').fill('야, 첫 줄만 서로 읽어볼래?');
  await page.getByRole('button', { name: '문장 복사' }).click();
  await expect(page.getByText('복사했어요. 원하는 곳에 붙여 넣으세요.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('야, 첫 줄만 서로 읽어볼래?');
  await page.getByLabel('남기고 싶은 한 줄').fill('신입을 도왔던 일이 다시 생각났다');
  await page.getByRole('button', { name: '오늘 해봤어요' }).click();
  await expect(page.getByText('오늘의 덕을 남겼어요')).toBeVisible();
  await page.reload();
  await expect(page.getByText('오늘의 덕을 남겼어요')).toBeVisible();
  await page.getByRole('link', { name: '기록장 보기' }).click();
  await expect(page.getByRole('heading', { name: '1일의 덕을 남겼어요' })).toBeVisible();
  await expect(page.getByText('신입을 도왔던 일이 다시 생각났다')).toBeVisible();
  await expect(page.getByRole('button', { name: '고른 덕 공유' })).toBeDisabled();
  await page.getByRole('checkbox', { name: action }).check();
  const save = page.getByRole('link', { name: '이미지 저장' });
  await expect(save).toBeVisible();
  const download = page.waitForEvent('download');
  await save.click();
  expect((await download).suggestedFilename()).toMatch(/이번 주의 덕.*png/);
  await expect(page.getByRole('figure', { name: '공유할 엽서 미리보기' }).getByRole('img')).toHaveAttribute(
    'alt',
    action,
  );
});

test('parent reading supports an unknown time and sends only selected categories', async ({ page }) => {
  await page.goto('/reading?topic=parent');
  await expect(page.getByText('부모인 내 사주로, 오늘 아이에게 건넬 말을 찾아요.')).toBeVisible();
  await page.getByLabel('내 생년월일').fill('19810418');
  const request = page.waitForRequest(
    (entry) => entry.url().endsWith('/api/readings') && entry.method() === 'POST',
  );
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  const payload = (await request).postDataJSON();
  expect(Object.keys(payload).sort()).toEqual(['concern', 'element', 'topic']);
  expect(payload.topic).toBe('parent');
  await expect(page.getByRole('heading', { name: '오늘의 기본 풀이' })).toBeVisible();
  await page.getByText('만세력 보기', { exact: true }).click();
  await expect(page.getByText('시주', { exact: true })).toBeVisible();
  await expect(page.getByText('미상', { exact: true })).toBeVisible();
});

test('the styled selector and past experience send a topic code without the entered text', async ({
  page,
}) => {
  await page.goto('/reading?topic=job');
  const concern = page.getByRole('combobox', { name: '가까운 고민' });
  await concern.press('Enter');
  await page.getByRole('option', { name: '다음 면접이 걱정돼요' }).click();
  await expect(concern).toContainText('다음 면접이 걱정돼요');
  await page.getByLabel('내 생년월일').fill('20021120');
  await page.getByLabel(/과거에 겪은 일/).fill('작년 4월 친구와 모의 면접을 연습해서 마음이 편했어요.');
  const request = page.waitForRequest(
    (entry) => entry.url().endsWith('/api/readings') && entry.method() === 'POST',
  );
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  const payload = (await request).postDataJSON();
  expect(Object.keys(payload).sort()).toEqual(['concern', 'element', 'experience', 'topic']);
  expect(payload).toMatchObject({ concern: 'interview', experience: 'interview' });
  await expect(page.getByText('면접이나 발표에 관한 과거 경험', { exact: false })).toBeVisible();
});

test('the home story link and main menu lead to a dedicated story archive', async ({ page, context }) => {
  await signInFixture(context);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '쇼츠 모아보기' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /덕담집 사주극장 백 번째 지원서/ })).toBeVisible();
  await page.getByRole('link', { name: '이야기 전체보기' }).click();
  await expect(page).toHaveURL(/\/stories$/);
  await expect(page.getByRole('heading', { level: 1, name: '이야기 속 오늘의 덕' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: '주 메뉴' });
  await expect(menu.getByRole('link', { name: '이야기' })).toHaveAttribute('aria-current', 'page');
  await page
    .getByRole('list', { name: '공개 이야기' })
    .getByRole('link', { name: '엄마가 지운 카톡' })
    .click();
  await expect(page.getByRole('heading', { name: '엄마가 지운 카톡' })).toBeVisible();
  await expect(menu.getByRole('link', { name: '이야기' })).toHaveAttribute('aria-current', 'location');
  await page.getByRole('link', { name: '이야기 모아보기' }).click();
  await expect(page).toHaveURL(/\/stories$/);
  await menu.getByRole('link', { name: '기록장' }).click();
  await expect(menu.getByRole('link', { name: '기록장' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('main').getByRole('link', { name: '오늘의 덕 고르기' }).click();
  await expect(page).toHaveURL(/\/stories$/);
});

test('old story bookmarks forward to the archive and preserve their query', async ({ page }) => {
  await page.goto('/?utm_source=youtube#stories');
  await expect(page).toHaveURL(/\/stories\?utm_source=youtube$/);
  await expect(page.getByRole('list', { name: '공개 이야기' })).toBeVisible();
});

test('the story playlist contacts YouTube only after the reader opens the player', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/embed?**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>테스트 재생목록</p>' }),
  );
  await page.goto('/stories');
  const launcher = page.getByRole('button', { name: '쇼츠 모아보기' });
  await expect(page.locator('iframe')).toHaveCount(0);
  await launcher.click();
  const frame = page.locator('iframe[title="쇼츠 모아보기"]');
  await expect(frame).toHaveAttribute(
    'src',
    /youtube-nocookie\.com\/embed\?.*list=PLdeokdam-test-playlist00/,
  );
  await expect(page.frameLocator('iframe[title="쇼츠 모아보기"]').getByText('테스트 재생목록')).toBeVisible();
  await page.getByRole('button', { name: '플레이어 닫기' }).click();
  await expect(frame).toHaveCount(0);
});

test('a student below the adult cutoff sees the free reading without the ad or sale offer', async ({
  page,
}) => {
  await page.goto('/reading?topic=admission');
  await page.getByLabel('내 생년월일').fill('20100615');
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  await expect(page.getByRole('heading', { name: '오늘의 기본 풀이' })).toBeVisible();
  await expect(page.getByRole('button', { name: /광고/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /7일 풀이/ })).toHaveCount(0);
});

test('a failed reading preserves the form and offers a basic fallback', async ({ page }) => {
  await page.route('**/api/readings', (route) => route.abort());
  await page.goto('/reading');
  await page.getByLabel('내 생년월일').fill('20021120');
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('풀이를 불러오지 못했어요');
  await expect(page.getByLabel('내 생년월일')).toHaveValue('20021120');
  await page.getByRole('button', { name: '기본 풀이 열기' }).click();
  await expect(page.getByRole('heading', { name: '오늘의 기본 풀이' })).toBeVisible();
});

test('an AI reading keeps its chosen action and sources through recording and reload', async ({
  page,
  context,
}) => {
  await signInFixture(context);
  const first = '금(金)이 모양을 바꾸는 이미지';
  const second = '지원서 첫 줄과 공고 맞춰보기';
  await page.route('**/api/readings', (route) =>
    route.fulfill({
      json: {
        mode: 'ai',
        interpretation: '금의 다듬는 이미지처럼, 오늘은 지원서 첫 줄에서 내 역할을 또렷하게 써봐도 좋아요.',
        action: second,
        sources: [
          { id: 'metal', title: first },
          { id: 'silence-trim', title: second },
        ],
      },
    }),
  );
  await page.goto('/reading?topic=job');
  await page.getByLabel('내 생년월일').fill('20021120');
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  await expect(page.getByRole('heading', { name: '오늘의 AI 풀이' })).toBeVisible();
  await expect(page.getByRole('heading', { name: second })).toBeVisible();
  await expect(page.getByRole('radio', { name: second })).toBeChecked();
  await page.getByText('만세력과 참고 자료', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '풀이에 참고한 자료' })).toBeVisible();
  await expect(page.getByRole('list').getByText(first)).toBeVisible();
  await expect(page.getByRole('list').getByText(second)).toBeVisible();
  await page.getByRole('button', { name: '오늘 해봤어요' }).click();
  await expect(page.getByRole('region', { name: '오늘 기록' }).getByText(second)).toBeVisible();

  await page.unroute('**/api/readings');
  await page.reload();
  await page.getByLabel('내 생년월일').fill('20021120');
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  await expect(page.getByRole('heading', { name: second })).toBeVisible();
  await page.getByText('만세력과 참고 자료', { exact: true }).click();
  await expect(page.getByRole('list').getByText(second)).toBeVisible();
});

test('the preview shows a real price, a sample day and an unavailable checkout without merchant credentials', async ({
  page,
}) => {
  await page.goto('/shop?topic=parent');
  await expect(page.getByRole('heading', { name: '결과를 기다리는 부모의 7일' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '복채 4,900원' })).toBeVisible();
  await expect(page.getByText(/결제 준비 중이에요/)).toBeVisible();
  await expect(page.getByRole('button', { name: /결제하기/ })).toHaveCount(0);
});

test('the extra reading opens on the ad provider grant and survives a reload', async ({ page }) => {
  await page.route('https://securepubads.g.doubleclick.net/tag/js/gpt.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: [
        'const pending = window.googletag.cmd;',
        'const listeners = new Map();',
        'const slot = { addService() {} };',
        'const pubads = {',
        '  setPrivacySettings() {},',
        '  addEventListener(name, listener) { listeners.set(name, listener); },',
        '  removeEventListener(name) { listeners.delete(name); },',
        '};',
        'window.googletag = {',
        '  apiReady: true, enums: { OutOfPageFormat: { REWARDED: 1 } },',
        '  pubads() { return pubads; }, defineOutOfPageSlot() { return slot; },',
        '  display() { listeners.get("rewardedSlotReady")({ slot, makeRewardedVisible() {',
        '    document.body.dataset.testAd = "playing"; return true;',
        '  }}); }, enableServices() {}, destroySlots() {}',
        '};',
        'window.addEventListener("test-ad-complete", () => {',
        '  listeners.get("rewardedSlotGranted")({ slot });',
        '  listeners.get("rewardedSlotClosed")({ slot });',
        '});',
        'window.addEventListener("test-ad-cancel", () => listeners.get("rewardedSlotClosed")({ slot }));',
        // Existing GPT cmd entries run when the test SDK becomes ready.
        'pending.forEach((entry) => entry());',
      ].join('\n'),
    }),
  );
  await page.goto('/reading');
  await page.getByLabel('내 생년월일').fill('19990123');
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  const button = page.getByRole('button', { name: '광고 1편 보고 추가 풀이 열기' });
  const bonus = page.getByRole('region', { name: '내 고민 추가 풀이' });
  await button.click();
  await expect(page.locator('body')).toHaveAttribute('data-test-ad', 'playing');
  await expect(bonus.getByText(/이미 해낸 일 하나에서/)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('test-ad-cancel')));
  await expect(button).toBeEnabled();
  await expect(bonus.getByText(/이미 해낸 일 하나에서/)).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('test-ad-complete')));
  await expect(bonus.getByText(/이미 해낸 일 하나에서/)).toBeVisible();
  await page.reload();
  await page.getByLabel('내 생년월일').fill('19990123');
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  await expect(bonus.getByText(/이미 해낸 일 하나에서/)).toBeVisible();
});
