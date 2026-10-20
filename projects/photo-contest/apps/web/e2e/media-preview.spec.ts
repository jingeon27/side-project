import { mkdir } from 'node:fs/promises';
import { createTestImage, createTestVideo } from '@photo-contest/test-kit';

import { expect, seedGroup, test } from './support/test';

test(
  '파일 미리보기는 사진·영상 재선택과 제거·재열기 뒤 실제 업로드까지 이어져야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const cookie = await signIn('미리보기 회원');
    const group = await seedGroup(cookie, '미리보기 그룹');
    const first = {
      name: 'landscape.png',
      mimeType: 'image/png',
      buffer: await createTestImage({ width: 120, height: 80 }),
    };
    const second = {
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: await createTestImage({ width: 80, height: 120 }),
    };
    await page.goto(`/groups/${group.id}`);
    const opener = page.getByRole('button', { name: '글쓰기', exact: true });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: '그룹에 글쓰기' });
    const picker = sheet.getByLabel('사진·동영상 선택', { exact: true });
    const image = sheet.getByRole('img', { name: '선택한 사진 미리보기', exact: true });
    const fileChooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: '파일 선택', exact: true }).click();
    await (await fileChooser).setFiles(first);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(120);
    const firstUrl = await image.getAttribute('src');
    await expect(sheet.getByRole('button', { name: '파일 선택', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '파일 바꾸기', exact: true })).toBeVisible();
    await picker.setInputFiles([]);
    await expect(image).toHaveAttribute('src', firstUrl ?? 'missing');
    const replacementChooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: '파일 바꾸기', exact: true }).click();
    await (await replacementChooser).setFiles(first);
    await expect(image).not.toHaveAttribute('src', firstUrl ?? 'missing');
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(120);
    await image.scrollIntoViewIfNeeded();
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-photo-preview.png` });
    await picker.setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await expect(sheet.getByText(/미리보기를 열 수 없어요/)).toBeVisible();
    await picker.setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: await createTestVideo() });
    const video = sheet.getByLabel('선택한 동영상 미리보기', { exact: true });
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
      .toBeGreaterThanOrEqual(2);
    await video.scrollIntoViewIfNeeded();
    await video.evaluate((el: HTMLVideoElement) => el.play());
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
    const previousVideo = await video.elementHandle();
    if (!previousVideo) throw new Error('재생한 미리보기가 있어야 한다');
    await picker.setInputFiles(second);
    await expect.poll(() => previousVideo.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await previousVideo.dispose();
    await expect(video).toHaveCount(0);
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]))
      .toEqual([80, 120]);
    await sheet.getByRole('button', { name: '선택한 파일 제거' }).click();
    await expect(image).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '파일 바꾸기', exact: true })).toHaveCount(0);
    const selectionChooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: '파일 선택', exact: true }).click();
    await (await selectionChooser).setFiles(first);
    await expect(image).toBeVisible();
    await sheet.getByRole('button', { name: '선택한 파일 제거' }).click();
    await expect(sheet.getByText('사진·동영상 또는 링크를 첨부해 주세요.')).toBeVisible();
    await picker.setInputFiles(first);
    await expect(image).toBeVisible();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await opener.click();
    await expect(sheet.getByRole('figure', { name: '선택한 파일 미리보기' })).toHaveCount(0);
    await picker.setInputFiles(second);
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]))
      .toEqual([80, 120]);
    await sheet.getByLabel('제목', { exact: true }).fill('세로 사진의 순간');
    await sheet.getByRole('checkbox', { name: /공유할 권리/ }).check();
    await sheet.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    const uploaded = page
      .getByRole('region', { name: '최신 게시물' })
      .getByRole('img', { name: '세로 사진의 순간', exact: true });
    await expect
      .poll(() => uploaded.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]))
      .toEqual([80, 120]);
  },
);
