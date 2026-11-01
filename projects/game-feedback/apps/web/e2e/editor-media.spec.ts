import { readFileSync } from 'node:fs';

import dayjs from 'dayjs';

import {
  PostDetailSchema,
  PostSchema,
  RichTextDocumentSchema,
  richTextMediaReferences,
  richTextToPlainText,
} from '@game-feedback/contracts';

import { expect, test } from './support/test';

const origin = 'http://127.0.0.1:3301';

test('uploaded JPEG and MP4 remain playable when a legacy Delta post is edited and saved', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  const content = form.getByRole('textbox', { name: '내용', exact: true });
  await expect(content).toBeVisible();
  await content.fill('사진과 동영상 업로드 초안');
  const imageChooser = page.waitForEvent('filechooser');
  await form.getByRole('button', { name: '사진 삽입', exact: true }).click();
  await (
    await imageChooser
  ).setFiles({
    name: 'legacy-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: readFileSync(
      new URL('../src/features/game-profile/assets/clash-royale-icon.jpg', import.meta.url),
    ),
  });
  const image = content.locator('img[data-post-media]');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const imageUrl = await image.getAttribute('src');
  const videoChooser = page.waitForEvent('filechooser');
  await form.getByRole('button', { name: '동영상 삽입', exact: true }).click();
  await (
    await videoChooser
  ).setFiles({
    name: 'legacy-clip.mp4',
    mimeType: 'video/mp4',
    buffer: readFileSync(new URL('./fixtures/editor-clip.mp4', import.meta.url)),
  });
  const uploadedVideo = content.locator('video');
  await expect(uploadedVideo).toBeVisible();
  await expect.poll(() => uploadedVideo.evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBe(160);
  const videoUrl = await uploadedVideo.getAttribute('src');

  // Attach the real uploaded resources using the exact pre-migration document
  // shape, including media between text segments on the same Delta line.
  const legacy = RichTextDocumentSchema.parse({
    ops: [
      { insert: '이전 미디어 제목' },
      { insert: '\n', attributes: { header: 2 } },
      { insert: '사진 앞 ' },
      { insert: { image: imageUrl } },
      { insert: ' 사진 뒤 동영상 앞 ' },
      { insert: { video: videoUrl } },
      { insert: ' 동영상 뒤', attributes: { bold: true } },
      { insert: '\n' },
      { insert: '기존 인용' },
      { insert: '\n', attributes: { blockquote: true } },
      { insert: '마지막 줄\n' },
    ],
  });
  const title = `이전 미디어 호환 ${dayjs().valueOf().toString(36)}`;
  const created = await page.request.post('/api/posts', {
    headers: { Origin: origin },
    data: {
      title,
      body: richTextToPlainText(legacy),
      document: legacy,
      board: 'FREE',
      categoryId: 'clash-royale',
    },
  });
  expect(created.ok()).toBe(true);
  const post = PostSchema.parse(await created.json());
  const detailPath = `/ko/posts/${post.id}?board=free`;
  await page.goto(detailPath);
  await expect(page.locator('.prose-body img')).toHaveAttribute('src', imageUrl ?? '');
  await expect(page.locator('.prose-body video')).toHaveAttribute('src', videoUrl ?? '');
  await page.locator('.detail-card:visible').getByRole('button', { name: '수정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '게시글 수정', exact: true });
  const editor = dialog.getByRole('textbox', { name: '내용', exact: true });
  await expect(editor.locator('h2')).toHaveText('이전 미디어 제목');
  await expect(editor.locator('blockquote')).toHaveText('기존 인용');
  await expect(editor.locator('strong')).toHaveText(' 동영상 뒤');
  await expect(editor.locator('img[data-post-media]')).toHaveAttribute('src', imageUrl ?? '');
  await expect(editor.locator('video')).toHaveAttribute('src', videoUrl ?? '');
  await editor.focus();
  await editor.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await editor.press('Enter');
  await page.keyboard.insertText('한글로 수정한 미디어 글');
  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/posts/${post.id}` && response.request().method() === 'PATCH',
  );
  await dialog.getByRole('button', { name: '수정 완료', exact: true }).click();
  expect((await saving).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const detail = PostDetailSchema.parse(await (await page.request.get(`/api/posts/${post.id}`)).json());
  const savedDocument = RichTextDocumentSchema.parse(detail.post.document);
  expect(detail.post.body).toBe(`${richTextToPlainText(legacy)}\n한글로 수정한 미디어 글`);
  expect(richTextMediaReferences(savedDocument)).toEqual(richTextMediaReferences(legacy));
  await expect(page.locator('.prose-body img')).toHaveAttribute('src', imageUrl ?? '');
  const video = page.locator('.prose-body video');
  await expect(video).toHaveAttribute('src', videoUrl ?? '');
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).toHaveAttribute('preload', 'metadata');
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBe(160);
  await video.evaluate(async (node) => {
    const player = node as HTMLVideoElement;
    player.muted = true;
    await player.play();
  });
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  const screenshot = testInfo.outputPath('legacy-media.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('legacy-media', { path: screenshot, contentType: 'image/png' });
  const crawler = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const publicPage = await crawler.newPage();
    await publicPage.goto(detailPath);
    await expect(publicPage.locator('.prose-body img')).toHaveAttribute('src', imageUrl ?? '');
    await expect(publicPage.locator('.prose-body video')).toHaveAttribute('src', videoUrl ?? '');
    expect((await crawler.request.get(videoUrl ?? '', { headers: { Range: 'bytes=0-31' } })).status()).toBe(
      206,
    );
  } finally {
    await crawler.close();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
