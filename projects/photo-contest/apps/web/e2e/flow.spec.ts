import type { Page } from '@playwright/test';

import { createTestImage, createTestVideo } from '@photo-contest/test-kit';

import { authenticate, expect, test, waitForHydrationOnLoad } from './support/test';

async function writePost(page: Page, title: string, video = false) {
  await page.getByRole('link', { name: '글쓰기', exact: true }).click();
  const sheet = page.getByRole('form', { name: '그룹에 글쓰기' });
  await sheet.getByLabel('제목', { exact: true }).fill(title);
  await sheet.getByLabel('사진·동영상 선택', { exact: true }).setInputFiles({
    name: video ? 'clip.mp4' : 'photo.png',
    mimeType: video ? 'video/mp4' : 'image/png',
    buffer: video ? await createTestVideo() : await createTestImage(),
  });
  if (video) {
    const preview = sheet.getByLabel('선택한 동영상 미리보기', { exact: true });
    await expect
      .poll(() => preview.evaluate((el: HTMLVideoElement) => el.readyState))
      .toBeGreaterThanOrEqual(2);
  }
  if (!video) {
    const preview = sheet.getByRole('img', { name: '선택한 사진 미리보기', exact: true });
    await expect.poll(() => preview.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
  await sheet.getByLabel('내용', { exact: true }).fill('합성도 환영하는 상시 그룹');
  await sheet.getByRole('checkbox', { name: /공유할 권리/ }).check();
  await sheet.getByRole('button', { name: '게시물 올리기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const post = page
    .getByRole('region', { name: '최신 게시물', exact: true })
    .getByRole('article', { name: title });
  await expect(post).toBeVisible();
  await expect(post.getByText('합성도 환영하는 상시 그룹', { exact: true })).toBeVisible();
}

test(
  '그룹 생성·초대·여러 사진과 동영상·이달의 인기·관리자 삭제가 이어져야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, browser, signIn }) => {
    await signIn('통합 관리자');
    await page.goto('/me');
    await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await page.getByRole('dialog').getByLabel('그룹 이름').fill('언제나 웃긴 그룹');
    await page.getByRole('dialog').getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/[^/]+$/);
    const galleryUrl = page.url();
    await expect(page.getByRole('button', { name: '대회 만들기', exact: true })).toHaveCount(0);
    await page.getByText('초대와 그룹 멤버', { exact: true }).click();
    const invite = await page.getByLabel('그룹 초대 링크').inputValue();
    await writePost(page, '첫 번째 합성');
    await writePost(page, '두 번째 순간');

    const friendContext = await browser.newContext({ viewport: { width: 393, height: 851 } });
    try {
      await authenticate(friendContext, '통합 회원');
      const friend = waitForHydrationOnLoad(await friendContext.newPage());
      await friend.goto(invite);
      await friend.getByRole('button', { name: '초대 수락하고 가입하기' }).click();
      await expect(friend).toHaveURL(galleryUrl);
      await writePost(friend, '움직이는 웃음', true);
      const latest = friend.getByRole('region', { name: '최신 게시물', exact: true });
      const videoPost = latest.getByRole('article', { name: '움직이는 웃음' });
      const video = videoPost.locator('video');
      await video.scrollIntoViewIfNeeded();
      await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
        .toBeGreaterThanOrEqual(1);
      await video.evaluate((el: HTMLVideoElement) => el.play());
      await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
      await video.evaluate((el: HTMLVideoElement) => {
        el.pause();
        el.currentTime = 0.3;
      });
      const photo = latest.getByRole('article', { name: '첫 번째 합성' });
      await photo.getByRole('button', { name: '첫 번째 합성 좋아요' }).click();
      await expect(photo.getByRole('button', { name: '첫 번째 합성 좋아요' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(photo.getByRole('button', { name: '첫 번째 합성 더보기' })).toHaveCount(0);
      const popular = friend.getByRole('region', { name: '이달의 인기', exact: true });
      await expect(popular.getByRole('article').first()).toHaveAccessibleName('첫 번째 합성');
      await page.reload();
      const ownerLatest = page.getByRole('region', { name: '최신 게시물', exact: true });
      await ownerLatest
        .getByRole('article', { name: '움직이는 웃음' })
        .getByRole('button', { name: '움직이는 웃음 더보기' })
        .click();
      await page.getByRole('menuitem', { name: '삭제', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '게시물 삭제하기' }).click();
      await expect(page.getByRole('article', { name: '움직이는 웃음' })).toHaveCount(0);
      await friend.reload();
      await expect(friend.getByRole('article', { name: '움직이는 웃음' })).toHaveCount(0);
    } finally {
      await friendContext.close();
    }
  },
);
