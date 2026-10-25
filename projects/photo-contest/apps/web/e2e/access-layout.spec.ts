import { mkdir } from 'node:fs/promises';

import { graphqlRequest, moveTestContest } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test('열어둔 대회는 서버 단계가 바뀌면 새로고침 없이 투표 화면으로 넘어가야 한다', async ({
  page,
  signIn,
}) => {
  test.setTimeout(110_000);
  const cookie = await signIn('자동전환-관리자');
  const group = await seedGroup(cookie, '자동전환 모임');
  const now = Date.now();
  const result = await graphqlRequest<{ createContest: { id: string } }>(API_URL, {
    cookie,
    origin: WEB_ORIGIN,
    query:
      'mutation($groupId: ID!, $startsAt: DateTime!, $submissionEndsAt: DateTime!, $endsAt: DateTime!) { createContest(groupId: $groupId, title: "자동전환 대회", startsAt: $startsAt, submissionEndsAt: $submissionEndsAt, endsAt: $endsAt) { id } }',
    variables: {
      groupId: group.id,
      startsAt: new Date(now).toISOString(),
      submissionEndsAt: new Date(now + 3_600_000).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
    },
  });
  const contestId = result.data?.createContest.id;
  if (!contestId || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  await moveTestContest(API_URL, { contestId, phase: 'UPCOMING', origin: WEB_ORIGIN });
  await page.goto(`/contests/${contestId}`);
  await expect(page.getByText('시작 예정', { exact: true })).toBeVisible();
  await moveTestContest(API_URL, { contestId, phase: 'VOTING', origin: WEB_ORIGIN });
  await expect(page.getByText('투표 진행 중', { exact: true })).toBeVisible({ timeout: 35_000 });
  await moveTestContest(API_URL, { contestId, phase: 'COMPLETED', origin: WEB_ORIGIN });
  await expect(page.getByText('대회 종료', { exact: true })).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole('button', { name: '결과 공유하기' })).toBeVisible();
});

test(
  '홈과 MY의 사용자 정보는 브라우저 JS 실행 전 서버 HTML에 있어야 한다',
  { tag: '@ios' },
  async ({ page, signIn }) => {
    const cookie = await signIn('SSR 사용자');
    const readServerText = async (path: string) => {
      const response = await page.request.get(path);
      expect(response.status()).toBe(200);
      return page.evaluate(
        (html) => {
          const document = new DOMParser().parseFromString(html, 'text/html');
          return {
            text: Array.from(document.querySelectorAll('h1,h2,h3,p')).map((element) => element.textContent),
            errors: document.querySelectorAll('template[data-dgst]').length,
          };
        },
        await response.text(),
      );
    };
    const home = await readServerText('/');
    expect(home.text).toContain('공개 그룹');
    expect(home.text).toContain('공개 그룹의 최신 사진');
    expect(home.errors).toBe(0);
    const group = await seedGroup(cookie, 'SSR 가입 그룹');
    await seedPost(cookie, group.id, 'SSR 개인 피드 사진');
    const memberHome = await readServerText('/');
    expect(memberHome.text).toContain('최신 게시물');
    expect(memberHome.text).toContain('SSR 개인 피드 사진');
    expect(memberHome.errors).toBe(0);
    const me = await readServerText('/me');
    expect(me.text).toContain('SSR 사용자');
    expect(me.text).toContain('참여 그룹');
    expect(me.errors).toBe(0);
  },
);

test(
  '로그인 게이트와 공개 초대는 사적인 그룹 내용을 노출하지 않아야 한다',
  { tag: '@ios' },
  async ({ page, signIn, context }) => {
    const cookie = await signIn('게이트-방장');
    const group = await seedGroup(cookie, '비공개 모임', 'PRIVATE');
    await context.clearCookies();
    await page.goto(`/groups/${group.id}`);
    await expect(page).toHaveURL(new RegExp('/sign\\?next='));
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await expect(page.getByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인하고 가입 신청하기' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '최신 게시물' })).toHaveCount(0);
    await page.goto(`/invite/${group.inviteToken}`);
    await expect(page.getByRole('heading', { name: '비공개 모임' })).toBeVisible();
    await expect(page.getByRole('button', { name: '초대 수락하고 가입하기' })).toHaveCount(0);
    await page.goto('/invite/missing-token');
    await expect(page.getByRole('alert').filter({ hasText: '초대 링크를 확인해 주세요' })).toBeVisible();
    await expect(page.getByRole('button', { name: '초대 수락하고 가입하기' })).toHaveCount(0);
  },
);

test('만료된 쿠키와 다른 그룹의 회원도 사적인 화면을 볼 수 없어야 한다', async ({
  page,
  signIn,
  context,
}) => {
  const ownerCookie = await signIn('권한-방장');
  const group = await seedGroup(ownerCookie, '다른 그룹의 비밀', 'PRIVATE');
  await context.clearCookies();
  await context.addCookies([
    { name: 'contest_session', value: 'a'.repeat(43), url: WEB_ORIGIN, httpOnly: true },
  ]);
  await page.goto(`/groups/${group.id}`);
  await expect(page).toHaveURL(new RegExp('/sign\\?next='));
  await signIn('권한-외부인');
  await page.goto(`/groups/${group.id}`);
  await expect(page.getByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
  await expect(page.getByRole('button', { name: '가입 신청하기', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '최신 게시물' })).toHaveCount(0);
});

test(
  '반응형 화면·메뉴·MY·로그아웃이 휴대폰과 데스크톱에서 동작해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('레이아웃-사용자');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '공개 그룹의 최신 사진' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const main = await page.locator('#pc-main').boundingBox();
    expect(main?.width).toBeLessThanOrEqual(1440);
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 1024) {
      expect(main?.width).toBeGreaterThan(1000);
      await expect(page.locator('[data-bottom-nav]')).toBeHidden();
    }
    if (!viewport || viewport.width < 1024) {
      await expect(page.locator('[data-bottom-nav]')).toBeVisible();
    }
    if (viewport && main) expect(Math.abs(main.x - (viewport.width - main.width) / 2)).toBeLessThan(2);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-home.png` });
    await page.getByRole('link', { name: 'MY', exact: true }).click();
    await expect(page.getByRole('heading', { name: '레이아웃-사용자' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '참여 그룹' })).toBeVisible();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page).toHaveURL(WEB_ORIGIN + '/sign');
    await expect(page.getByRole('button', { name: /구글|Google/ })).toBeVisible();
    expect((await page.request.get(`${API_URL}/health`)).status()).toBe(200);
  },
);
