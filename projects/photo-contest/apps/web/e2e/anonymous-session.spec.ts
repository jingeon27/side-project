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
  },
);
