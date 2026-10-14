import { mkdir } from 'node:fs/promises';
import { graphqlRequest, moveTestContest } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { expect, seedGroup, test } from './support/test';

test('열어둔 대회는 서버 단계가 바뀌면 새로고침 없이 투표 화면으로 넘어가야 한다', async ({
  page,
  signIn,
}) => {
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
});

test(
  '로그인 게이트와 공개 초대는 사적인 그룹 내용을 노출하지 않아야 한다',
  { tag: '@ios' },
  async ({ page, signIn, context }) => {
    const cookie = await signIn('게이트-방장');
    const group = await seedGroup(cookie, '비공개 모임');
    await context.clearCookies();
    await page.goto(`/groups/${group.id}`);
    await expect(page).toHaveURL(new RegExp('/\\?next='));
    await expect(page.getByRole('button', { name: /구글|Google/ })).toBeVisible();
    await expect(page.getByText('비공개 모임', { exact: true })).toHaveCount(0);
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
  const group = await seedGroup(ownerCookie, '다른 그룹의 비밀');
  await context.clearCookies();
  await context.addCookies([
    { name: 'contest_session', value: 'a'.repeat(43), url: WEB_ORIGIN, httpOnly: true },
  ]);
  await page.goto(`/groups/${group.id}`);
  await expect(page.getByRole('button', { name: /구글|Google/ })).toBeVisible();
  await signIn('권한-외부인');
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: '접근할 권한이 없습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '다른 그룹의 비밀', exact: true })).toHaveCount(0);
});

test(
  '앱 열·하단 탭·MY·로그아웃이 휴대폰과 데스크톱에서 동작해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('레이아웃-사용자');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '내 그룹' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const main = await page.locator('#pc-main').boundingBox();
    expect(main?.width).toBeLessThanOrEqual(540);
    const viewport = page.viewportSize();
    if (viewport && main) expect(Math.abs(main.x - (viewport.width - main.width) / 2)).toBeLessThan(2);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-home.png`, fullPage: true });
    await page.getByRole('link', { name: 'MY', exact: true }).click();
    await expect(page.getByRole('heading', { name: '레이아웃-사용자' })).toBeVisible();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page).toHaveURL(WEB_ORIGIN + '/');
    await expect(page.getByRole('button', { name: /구글|Google/ })).toBeVisible();
    expect((await page.request.get(`${API_URL}/health`)).status()).toBe(200);
  },
);
