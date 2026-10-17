import { test, expect, type APIRequestContext } from '@playwright/test';
import { getSession, listCategories, listPosts } from '@game-feedback/sdk';
import {
  GetSessionResponse,
  ListCategoriesResponse,
  ListPostsResponse,
} from '../../../packages/sdk/src/generated/validation';

const origin = 'http://127.0.0.1:3301';

test('generated Orval client and response schemas match the running test API', async () => {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => nativeFetch(new URL(String(input), origin), options);
  try {
    expect(GetSessionResponse.parse(await getSession()).demoMode).toBe(true);
    expect(ListCategoriesResponse.parse(await listCategories()).length).toBeGreaterThan(0);
    const page = ListPostsResponse.parse(await listPosts({ limit: 2 }));
    expect(page.items.length).toBeLessThanOrEqual(2);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

async function signIn(context: APIRequestContext, nickname: string) {
  const response = await context.post('/api/auth/demo', { headers: { Origin: origin }, data: { nickname } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).user as { id: string; nickname: string };
}

test('request → answer → notification → helpful, with ownership and origin protection', async ({
  playwright,
}) => {
  const requester = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const coach = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const anonymous = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const suffix = Date.now().toString(36);
  try {
    const owner = await signIn(requester, `요청자_${suffix}`);
    const provider = await signIn(coach, `코치_${suffix}`);
    const categories = await (await requester.get('/api/categories')).json();
    const categoryId = categories[0].id as string;
    const profile = await requester.get('/api/game-profiles/%23P0LYQ');
    expect(profile.ok()).toBeTruthy();
    expect((await profile.json()).verification).toBe('UNVERIFIED');
    expect(
      (await requester.post('/api/me/game-accounts', { data: { playerTag: '#P0LYQ' } })).ok(),
    ).toBeTruthy();
    const created = await requester.post('/api/posts', {
      data: {
        title: `호그 덱 운영 피드백 ${suffix}`,
        body: '더블 엘릭서에 수비 카드가 꼬입니다. 상대의 탱커와 반대 라인 압박에 어떻게 대응하면 좋을까요?',
        categoryId,
        playerTag: '#P0LYQ',
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const post = await created.json();
    expect(post.gameProfile.playerTag).toBe('#P0LYQ');
    expect(
      (
        await anonymous.post(`/api/posts/${post.id}/answers`, {
          data: { body: '인증되지 않은 답변을 차단하는지 검사합니다.' },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await coach.patch(`/api/posts/${post.id}`, { data: { title: '다른 사용자가 바꾼 제목입니다.' } })
      ).status(),
    ).toBe(403);
    const answered = await coach.post(`/api/posts/${post.id}/answers`, {
      data: {
        body: '상대 탱커가 뒤에서 나오면 반대 라인에 호그만 보내세요. 수비 건물을 먼저 확보하고 주문은 후속 유닛에 사용하면 됩니다.',
      },
    });
    expect(answered.ok(), await answered.text()).toBeTruthy();
    const answer = await answered.json();
    expect(answer.author.id).toBe(provider.id);
    expect(
      (await coach.post(`/api/answers/${answer.id}/helpful`, { data: { helpful: true } })).status(),
    ).toBe(403);
    const notifications = await (await requester.get('/api/notifications')).json();
    expect(notifications.items.some((item: { postId: string }) => item.postId === post.id)).toBeTruthy();
    expect((await requester.post(`/api/posts/${post.id}/read`)).ok()).toBeTruthy();
    const helped = await requester.post(`/api/answers/${answer.id}/helpful`, { data: { helpful: true } });
    expect(helped.ok(), await helped.text()).toBeTruthy();
    expect((await helped.json()).helpful).toBe(true);
    const detail = await (await requester.get(`/api/posts/${post.id}`)).json();
    expect(detail.post.helpfulCount).toBe(1);
    expect(detail.answers[0].readAt).toBeTruthy();
    const denied = await requester.post('/api/posts', {
      headers: { Origin: 'https://untrusted.example' },
      data: {
        title: '위조 요청',
        body: '교차 사이트 요청은 거부되어야 하며 저장되면 안 됩니다.',
        categoryId,
      },
    });
    expect(denied.status()).toBe(403);
    expect(owner.id).not.toBe(provider.id);
  } finally {
    await requester.dispose();
    await coach.dispose();
    await anonymous.dispose();
  }
});

test('Korean feed renders, demo login opens, mobile stays within viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/ko');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: /피드백|플레이|함께/ }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/feed-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('players create a profile-backed request and exchange helpful feedback in the browser', async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString(36);
  await page.goto('/ko');
  await page.getByRole('button', { name: '로그인 / 시작하기' }).click();
  const login = page.getByRole('dialog');
  await login.getByLabel('서비스 닉네임').fill(`플레이어_${suffix}`);
  await login.getByRole('checkbox').nth(0).check();
  await login.getByRole('checkbox').nth(1).check();
  await login.getByRole('button', { name: '데모로 시작하기' }).click();
  await expect(login).not.toBeVisible();
  await page.goto('/ko/settings');
  await page.getByRole('textbox', { name: /플레이어 태그/ }).fill('#P0LYQ');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.getByRole('button', { name: '이 프로필 연결하기' }).click();
  await expect(page.getByRole('status')).toContainText('게임 프로필이 연결');
  await page.goto('/ko');
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const composer = page.getByRole('dialog');
  const title = `브라우저에서 작성한 덱 피드백 ${suffix}`;
  await composer.getByLabel('제목', { exact: true }).fill(title);
  await composer
    .getByRole('textbox', { name: /플레이와 고민/ })
    .fill(
      '호그 순환 덱으로 상대 메가나이트를 막을 때 중앙 건물을 어떤 타이밍에 내려야 할지 궁금합니다. 수비 순서를 알려주세요.',
    );
  await composer.getByRole('button', { name: '피드백 요청 올리기' }).click();
  await expect(page).toHaveURL(/\/ko\/posts\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  const postUrl = page.url();
  const coach = await browser.newContext({ baseURL: origin });
  try {
    await signIn(coach.request, `브라우저코치_${suffix}`);
    const coachPage = await coach.newPage();
    await coachPage.goto(postUrl);
    await coachPage
      .getByRole('textbox', { name: '피드백 내용' })
      .fill(
        '메가나이트가 강을 건너기 전에 대포를 중앙에 내려서 양쪽 타워가 함께 공격하게 하세요. 머스킷병은 점프 범위 밖에 배치하세요.',
      );
    await coachPage.getByRole('button', { name: '피드백 남기기', exact: true }).click();
    await expect(coachPage.getByRole('status')).toContainText('피드백을 전했어요');
    await page.reload();
    await page.getByRole('button', { name: '도움이 됐어요', exact: true }).click();
    await expect(page.getByText('요청자가 도움받은 피드백')).toBeVisible();
  } finally {
    await coach.close();
  }
});
