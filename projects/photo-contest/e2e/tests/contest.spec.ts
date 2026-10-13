import { expect, test } from '@playwright/test';
import { PrismaClient } from '@photo-contest/api/database-client';
import sharp from 'sharp';
import { resolve } from 'node:path';
test('친구 초대·사진 제출·투표·공동 우승까지 동작해야 한다', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /카톡에 묻히기엔/ })).toBeVisible();
  await page.getByLabel('닉네임', { exact: true }).fill('대회 관리자');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('button', { name: '그룹 만들기' })).toBeVisible();
  await page.getByRole('button', { name: '그룹 만들기' }).click();
  await page.getByLabel('그룹 이름').fill('우리의 웃음 연구소');
  await page.getByRole('dialog').getByRole('button', { name: '그룹 만들기' }).click();
  await expect(page.getByRole('heading', { name: '우리의 웃음 연구소', exact: true })).toBeVisible();
  const invite = await page.getByLabel('그룹 초대 링크').inputValue();
  await page.getByRole('button', { name: '대회 열기' }).click();
  await page.getByLabel('대회 제목').fill('이번 주 웃긴 사진');
  await page.getByRole('dialog').getByRole('button', { name: '대회 열기' }).click();
  await expect(page.getByRole('heading', { name: '이번 주 웃긴 사진', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/contests\//);
  const contestUrl = page.url();
  const contestId = contestUrl.split('/').at(-1)!;
  const image = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#f1cc64' } })
    .png()
    .toBuffer();
  async function upload(target: typeof page, caption: string) {
    await target.getByRole('button', { name: '사진 제출하기', exact: true }).click();
    await target
      .getByLabel('사진 선택')
      .setInputFiles({ name: 'moment.png', mimeType: 'image/png', buffer: image });
    await target.getByLabel('사진 설명').fill(caption);
    await target.getByRole('checkbox').check();
    await target.getByRole('dialog').getByRole('button', { name: '사진 제출하기', exact: true }).click();
    await expect(target.getByRole('heading', { name: caption, exact: true })).toBeVisible();
    await expect(target.getByText('사진 제출 완료!')).toBeVisible();
  }
  await upload(page, '관리자의 웃긴 순간');
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  friend.on('pageerror', (error) => errors.push(error.message));
  await friend.goto(invite);
  await friend.getByLabel('닉네임', { exact: true }).fill('초대받은 친구');
  await friend.getByRole('button', { name: '시작하기' }).click();
  await friend.getByRole('button', { name: '초대 수락하고 가입하기' }).click();
  await expect(friend.getByRole('heading', { name: '우리의 웃음 연구소', exact: true })).toBeVisible();
  await friend.goto(contestUrl);
  await upload(friend, '친구의 웃긴 순간');
  const db = new PrismaClient();
  try {
    await db.contest.update({
      where: { id: contestId },
      data: { submissionEndsAt: new Date(Date.now() - 1000) },
    });
    await page.reload();
    await friend.reload();
    const ownerCard = friend
      .getByRole('article')
      .filter({ has: friend.getByRole('heading', { name: '관리자의 웃긴 순간' }) });
    await friend.route('**/backend/graphql', async (route) => {
      const body = route.request().postDataJSON();
      if (body.operationName === 'CastVote') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [
              { message: '투표에 실패했습니다. 다시 시도해 주세요.', extensions: { code: 'CONFLICT' } },
            ],
          }),
        });
        await friend.unroute('**/backend/graphql');
      } else await route.continue();
    });
    await ownerCard.getByRole('button', { name: '이 사진에 한 표!' }).click();
    await expect(ownerCard.getByRole('button', { name: '내가 뽑은 사진' })).toBeVisible();
    await expect(
      ownerCard.getByText('투표에 실패했습니다. 다시 시도해 주세요.', { exact: true }),
    ).toBeVisible();
    await expect(ownerCard.getByRole('button', { name: '이 사진에 한 표!' })).toBeEnabled();
    await ownerCard.getByRole('button', { name: '이 사진에 한 표!' }).click();
    await expect(ownerCard.getByRole('button', { name: '내가 뽑은 사진' })).toBeDisabled();
    const friendCard = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: '친구의 웃긴 순간' }) });
    await friendCard.getByRole('button', { name: '이 사진에 한 표!' }).click();
    await expect(friendCard.getByRole('button', { name: '내가 뽑은 사진' })).toBeDisabled();
    await db.contest.update({ where: { id: contestId }, data: { endsAt: new Date(Date.now() - 1000) } });
    await page.reload();
    await expect(page.getByRole('heading', { name: '함께 웃겼다면, 함께 우승!' })).toBeVisible();
    await expect(page.locator('.winner-card')).toHaveCount(2);
    await page.screenshot({ path: resolve('.data/contest-results-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve('.data/contest-results-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const html = await (await page.request.get(contestUrl)).text();
    const sessionCookie = (await page.context().cookies()).find((c) => c.name === 'contest_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(html).not.toContain(sessionCookie!.value);
    const managedCard = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: '친구의 웃긴 순간' }) });
    await managedCard.getByRole('button', { name: '숨기기' }).click();
    await expect(page.getByRole('heading', { name: '숨긴 사진 관리', exact: true })).toBeVisible();
    const hiddenCard = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: '친구의 웃긴 순간' }) });
    await expect(hiddenCard.getByText('숨겨진 사진', { exact: true })).toBeVisible();
    await hiddenCard.getByRole('button', { name: '삭제', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '사진 삭제하기' }).click();
    await expect(page.getByRole('heading', { name: '친구의 웃긴 순간', exact: true })).not.toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '우리의 웃음 연구소', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: resolve('.data/home-desktop.png'), fullPage: true });
  } finally {
    await db.$disconnect();
    await friendContext.close();
  }
  expect(errors).toEqual([]);
});

test('로그인 실패와 폼 오류를 안내하고 비회원 사진 접근을 차단해야 한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByText('닉네임을 입력해 주세요.', { exact: true })).toBeVisible();
  const denied = await page.request.get('/backend/photos/unknown-id');
  expect(denied.status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve('.data/login-mobile.png'), fullPage: true });
});
