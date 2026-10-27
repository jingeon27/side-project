import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { expect, seedGroup, test } from './support/test';

test(
  '익명으로 시작해 공개 그룹에 가입하고 비공개 그룹은 로그인을 안내해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page }, testInfo) => {
    const owner = await createTestUser(API_URL, { nickname: '익명 안내 그룹장', origin: WEB_ORIGIN });
    const publicGroup = await seedGroup(owner, '누구나 참여하는 웃음');
    const privateName = `우리만 보는 순간-${testInfo.project.name}`;
    const privateGroup = await seedGroup(owner, privateName, 'PRIVATE');
    await page.goto('/');
    await expect(page.getByText('로컬 체험용 로그인')).toHaveCount(0);
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '익명으로 시작하기', exact: true })).toHaveCount(0);
    await page.goto(`/groups/${publicGroup.id}`);
    await page.getByRole('button', { name: '그룹 가입하기', exact: true }).click();
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toBeVisible();
    await page.goto('/me');
    await expect(page.getByText('익명 프로필은 이 브라우저의 세션으로 유지돼요.')).toBeVisible();
    const nickname = await page.getByRole('heading', { level: 2 }).first().innerText();
    await expect(page.getByRole('link', { name: '로그인 · 회원가입', exact: true })).toHaveCount(0);
    await expect(
      page.getByText('다른 기기에서도 프로필과 기록을 이어가고 싶다면', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    const logout = page.getByRole('alertdialog', { name: '익명 프로필에서 로그아웃할까요?' });
    await expect(logout).toContainText('기록에 다시 접근할 수 없어요.');
    await logout.getByRole('button', { name: '취소', exact: true }).click();
    await expect(logout).toHaveCount(0);
    await page.getByRole('link', { name: '회원가입', exact: true }).click();
    await expect(page.getByRole('tab', { name: '회원가입', selected: true })).toBeVisible();
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: nickname, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: nickname, exact: true })).toBeVisible();
    await page.goto(`/explore?q=${encodeURIComponent(privateName)}`);
    await page.getByRole('link', { name: privateName, exact: true }).click();
    const discoveryPrompt = page.getByRole('alertdialog', { name: '로그인이 필요해요' });
    await expect(discoveryPrompt).toContainText('비공개 그룹은 익명으로 이용할 수 없어요.');
    await discoveryPrompt.getByRole('button', { name: '취소', exact: true }).click();
    await expect(discoveryPrompt).toHaveCount(0);
    await expect(page).toHaveURL(/\/explore\?q=/);
    await page.goto(`/groups/${privateGroup.id}`);
    await page.getByRole('button', { name: '로그인하고 가입 신청하기', exact: true }).click();
    const prompt = page.getByRole('alertdialog', { name: '로그인이 필요해요' });
    await expect(prompt).toContainText('비공개 그룹은 익명으로 이용할 수 없어요.');
    await prompt.getByRole('button', { name: '로그인하기', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sign\\?next=`));
    await expect(page.getByRole('button', { name: '아이디로 로그인', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '익명으로 계속하기', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '익명으로 계속하기', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: nickname, exact: true })).toBeVisible();
    await page.goto(`/invite/${privateGroup.inviteToken}`);
    await expect(page.getByRole('button', { name: '로그인하고 가입 신청하기', exact: true })).toBeVisible();
    await page.goto('/me');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '로그아웃하기', exact: true }).click();
    await expect(page).toHaveURL(/\/sign$/);
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '익명으로 시작하기', exact: true })).toHaveCount(0);
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: nickname, exact: true })).toHaveCount(0);
  },
);

test(
  '익명 기록은 회원가입 뒤 다른 브라우저에서도 이어갈 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, browser }, testInfo) => {
    const owner = await createTestUser(API_URL, { nickname: '기록 유지 그룹장', origin: WEB_ORIGIN });
    const groupName = `가입 뒤에도 이어갈 그룹-${testInfo.project.name}`;
    const group = await seedGroup(owner, groupName);
    await page.goto('/');
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '익명으로 시작하기', exact: true })).toHaveCount(0);
    await page.goto(`/groups/${group.id}`);
    await page.getByRole('button', { name: '그룹 가입하기', exact: true }).click();
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toBeVisible();
    await page.goto('/me');
    await page.getByRole('link', { name: '회원가입', exact: true }).click();
    const signup = page.getByRole('tabpanel', { name: '회원가입', exact: true });
    const loginId = `keep_${testInfo.project.name.startsWith('mobile') ? 'ios' : 'web'}_${Date.now().toString(36)}`;
    await signup.getByLabel('아이디', { exact: true }).fill(loginId);
    await signup.getByLabel('닉네임', { exact: true }).fill('기록을 이어가는 회원');
    await signup.getByLabel('비밀번호', { exact: true }).fill('star2026');
    await signup.getByRole('button', { name: '가입하고 시작하기', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('link', { name: new RegExp(groupName) })).toBeVisible();
    await expect(page.getByText('익명 프로필은 이 브라우저의 세션으로 유지돼요.')).toHaveCount(0);
    const otherDevice = await browser.newContext({ baseURL: WEB_ORIGIN });
    try {
      const otherPage = await otherDevice.newPage();
      await otherPage.goto('/sign?next=%2Fme');
      const login = otherPage.getByRole('tabpanel', { name: '로그인', exact: true });
      await login.getByLabel('아이디', { exact: true }).fill(loginId);
      await login.getByLabel('비밀번호', { exact: true }).fill('star2026');
      await login.getByRole('button', { name: '아이디로 로그인', exact: true }).click();
      await expect(otherPage).toHaveURL(/\/me$/);
      await expect(otherPage.getByRole('link', { name: new RegExp(groupName) })).toBeVisible();
    } finally {
      await otherDevice.close();
    }
  },
);
