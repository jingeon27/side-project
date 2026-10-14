import { createTestImage, moveTestContest } from '@photo-contest/test-kit';
import type { Page } from '@playwright/test';

import { API_URL, WEB_ORIGIN } from './support/env';
import { authenticate, expect, test } from './support/test';

async function submitPhoto(page: Page, caption: string) {
  await page.getByRole('button', { name: '사진 제출하기', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet
    .getByLabel('사진 선택', { exact: true })
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await createTestImage() });
  await sheet.getByLabel('사진 설명').fill(caption);
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: '사진 제출하기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: '사진 제출 완료' })).toBeDisabled();
}

test(
  '그룹 생성부터 친구 가입·사진 제출·좋아요·투표·결과까지 이어져야 한다',
  { tag: '@ios' },
  async ({ page, browser, signIn }) => {
    await signIn('통합-방장');
    await page.goto('/');
    await page.getByRole('button', { name: '그룹 만들기' }).click();
    await page.getByRole('dialog').getByLabel('그룹 이름').fill('통합 모임');
    await page.getByRole('dialog').getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/[^/]+$/);
    const invite = await page.getByLabel('그룹 초대 링크').inputValue();
    await page.getByRole('button', { name: '대회 만들기', exact: true }).click();
    await page.getByRole('dialog').getByLabel('대회 제목').fill('통합 대회');
    await page.getByRole('dialog').getByRole('button', { name: '대회 열기' }).click();
    await expect(page).toHaveURL(/\/contests\/[^/]+$/);
    const contestId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    await submitPhoto(page, '방장의 웃긴 순간');

    const friendContext = await browser.newContext({ viewport: { width: 393, height: 851 } });
    try {
      await authenticate(friendContext, '통합-친구');
      const friend = await friendContext.newPage();
      await friend.goto(invite);
      await friend.getByRole('button', { name: '초대 수락하고 가입하기' }).click();
      await expect(friend).toHaveURL(/\/groups\/[^/]+$/);
      await expect(friend.getByRole('button', { name: '대회 만들기', exact: true })).toHaveCount(0);
      await friend.getByRole('link', { name: /통합 대회/ }).click();
      await submitPhoto(friend, '친구의 웃긴 순간');
      const ownerPhoto = friend.getByRole('article', { name: '방장의 웃긴 순간' });
      await ownerPhoto.getByRole('button', { name: '좋아요 0개' }).click();
      await expect(ownerPhoto.getByRole('button', { name: '좋아요 1개' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await moveTestContest(API_URL, { contestId, phase: 'VOTING', origin: WEB_ORIGIN });
      await friend.reload();
      await ownerPhoto.getByRole('button', { name: '이 사진에 한 표!' }).click();
      await expect(ownerPhoto.getByRole('button', { name: '내가 뽑은 사진' })).toBeDisabled();
      await expect(
        friend
          .getByRole('article', { name: '친구의 웃긴 순간' })
          .getByRole('button', { name: '내 사진에는 투표할 수 없어요' }),
      ).toBeDisabled();
      await page.reload();
      await page
        .getByRole('article', { name: '친구의 웃긴 순간' })
        .getByRole('button', { name: '숨기기' })
        .click();
      await expect(page.getByRole('heading', { name: '숨긴 사진' })).toBeVisible();
      await expect(page.getByRole('article', { name: '친구의 웃긴 순간' })).toHaveCount(1);
      await expect(page.getByRole('article', { name: '친구의 웃긴 순간' })).toHaveAttribute(
        'data-hidden',
        'true',
      );
      await moveTestContest(API_URL, { contestId, phase: 'COMPLETED', origin: WEB_ORIGIN });
      await page.reload();
      await expect(page.getByRole('heading', { name: '이번 대회 최고의 웃음!' })).toBeVisible();
      await expect(page.getByRole('article', { name: '방장의 웃긴 순간' })).toHaveAttribute(
        'data-winner',
        'true',
      );
      await expect(
        page.getByRole('article', { name: '방장의 웃긴 순간' }).getByText('1표', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '사진 제출하기', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '뒤로 가기' }).click();
      await expect(page).toHaveURL(/\/groups\/[^/]+$/);
      await expect(page.getByRole('heading', { name: '그룹 순위' })).toBeVisible();
      await expect(page.getByText('우승 1회 · 받은 표 1 · 좋아요 1')).toBeVisible();
    } finally {
      await friendContext.close();
    }
  },
);
