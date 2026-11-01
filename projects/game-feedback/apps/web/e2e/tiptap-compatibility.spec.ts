import dayjs from 'dayjs';

import {
  PostDetailSchema,
  PostSchema,
  RichTextDocumentSchema,
  richTextToPlainText,
} from '@game-feedback/contracts';

import { expect, test } from './support/test';

const origin = 'http://127.0.0.1:3301';

const legacyDocument = RichTextDocumentSchema.parse({
  ops: [
    { insert: '이전 제목' },
    { insert: '\n', attributes: { header: 2 } },
    { insert: '작은 제목' },
    { insert: '\n', attributes: { header: 3 } },
    { insert: '모든 글자 서식', attributes: { bold: true, italic: true, underline: true, strike: true } },
    { insert: '과 ' },
    { insert: '이전 링크', attributes: { link: 'https://example.com/legacy?q=1' } },
    { insert: '\n\n' },
    { insert: '첫 번호' },
    { insert: '\n', attributes: { list: 'ordered' } },
    { insert: '둘째 번호' },
    { insert: '\n', attributes: { list: 'ordered' } },
    { insert: '글머리 항목' },
    { insert: '\n', attributes: { list: 'bullet' } },
    { insert: '이전 인용' },
    { insert: '\n', attributes: { blockquote: true } },
    { insert: '마지막 문단\n' },
  ],
});

test('legacy Delta formatting survives editing, reload and public HTML', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  const title = `이전 글 호환 ${dayjs().valueOf().toString(36)}`;
  const created = await page.request.post('/api/posts', {
    headers: { Origin: origin },
    data: {
      title,
      body: richTextToPlainText(legacyDocument),
      document: legacyDocument,
      board: 'FREE',
      categoryId: 'clash-royale',
    },
  });
  expect(created.ok()).toBe(true);
  const post = PostSchema.parse(await created.json());
  await page.goto(`/ko/posts/${post.id}?board=free`);
  await expect(page.locator('.prose-body h2')).toHaveText('이전 제목');
  await expect(page.locator('.prose-body ol li')).toHaveText(['첫 번호', '둘째 번호']);
  await page.locator('.detail-card:visible').getByRole('button', { name: '수정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '게시글 수정', exact: true });
  const body = dialog.getByRole('textbox', { name: '내용', exact: true });
  await expect(body.locator('h2')).toHaveText('이전 제목');
  await expect(body.locator('h3')).toHaveText('작은 제목');
  for (const tag of ['strong', 'em', 'u', 's']) await expect(body.locator(tag)).toHaveText('모든 글자 서식');
  await expect(body.getByRole('link', { name: '이전 링크', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/legacy?q=1',
  );
  await expect(body.locator('ol li')).toHaveText(['첫 번호', '둘째 번호']);
  await expect(body.locator('ul li')).toHaveText(['글머리 항목']);
  await expect(body.locator('blockquote')).toHaveText('이전 인용');
  await expect(body.locator('p').filter({ hasText: /^$/ })).toHaveCount(1);
  const legacyScreenshot = testInfo.outputPath('legacy-editor.png');
  await page.screenshot({ path: legacyScreenshot });
  await testInfo.attach('legacy-editor', { path: legacyScreenshot, contentType: 'image/png' });
  await body.focus();
  await body.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await body.press('Enter');
  await page.keyboard.insertText('한글로 덧붙인 문단');
  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/posts/${post.id}` && response.request().method() === 'PATCH',
  );
  await dialog.getByRole('button', { name: '수정 완료', exact: true }).click();
  expect((await saving).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.prose-body h2')).toHaveText('이전 제목');
  await expect(page.locator('.prose-body h3')).toHaveText('작은 제목');
  await expect(page.locator('.prose-body ol li')).toHaveText(['첫 번호', '둘째 번호']);
  await expect(page.locator('.prose-body ul li')).toHaveText(['글머리 항목']);
  await expect(page.locator('.prose-body blockquote')).toHaveText('이전 인용');
  await expect(page.locator('.prose-body')).toContainText('한글로 덧붙인 문단');
  const detail = PostDetailSchema.parse(await (await page.request.get(`/api/posts/${post.id}`)).json());
  expect(detail.post.body).toBe(`${richTextToPlainText(legacyDocument)}\n한글로 덧붙인 문단`);
  expect(richTextToPlainText(RichTextDocumentSchema.parse(detail.post.document))).toBe(detail.post.body);
  const crawler = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const htmlPage = await crawler.newPage();
    await htmlPage.goto(`/ko/posts/${post.id}?board=free`);
    await expect(htmlPage.locator('.prose-body strong')).toHaveText('모든 글자 서식');
    await expect(htmlPage.locator('.prose-body')).toContainText('한글로 덧붙인 문단');
  } finally {
    await crawler.close();
  }
});

test('Chromium IME composition updates and commits Korean once before publishing', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The native composition protocol is Chromium-specific.');
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const body = page.getByRole('textbox', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  await page.getByLabel('제목', { exact: true }).fill(`한글 조합 ${dayjs().valueOf().toString(36)}`);
  await body.focus();
  const session = await page.context().newCDPSession(page);
  try {
    for (const text of ['ㅎ', '하', '한']) {
      await session.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await expect(body).toHaveText(text);
      expect(await body.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('none');
    }
    await session.send('Input.insertText', { text: '한' });
    await expect(body).toHaveText('한');
    await page.keyboard.insertText('글 입력');
    await body.press('Enter');
    await page.keyboard.insertText('둘째 줄');
    const saving = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/posts' && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '게시글 등록', exact: true }).click();
    const response = await saving;
    expect(response.ok()).toBe(true);
    const post = PostSchema.parse(await response.json());
    expect(post.body).toBe('한글 입력\n둘째 줄');
    expect(richTextToPlainText(RichTextDocumentSchema.parse(post.document))).toBe(post.body);
    await expect(page).toHaveURL((url) => url.pathname === `/ko/posts/${post.id}`);
    await page.reload();
    await expect(page.locator('.prose-body p')).toHaveText(['한글 입력', '둘째 줄']);
  } finally {
    await session.detach();
  }
});

test('legacy plain text can be edited into a valid compatible document', async ({ page }) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  const bodyText = '서식 없이 남긴 이전 글입니다.\n두 번째 줄도 그대로 남습니다.';
  const created = await page.request.post('/api/posts', {
    headers: { Origin: origin },
    data: {
      title: `평문 호환 ${dayjs().valueOf().toString(36)}`,
      body: bodyText,
      board: 'FREE',
      categoryId: 'clash-royale',
    },
  });
  expect(created.ok()).toBe(true);
  const post = PostSchema.parse(await created.json());
  await page.goto(`/ko/posts/${post.id}?board=free`);
  await page.locator('.detail-card:visible').getByRole('button', { name: '수정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '게시글 수정', exact: true });
  const body = dialog.getByRole('textbox', { name: '내용', exact: true });
  await expect(body.locator('p')).toHaveText(bodyText.split('\n'));
  await body.fill(`${bodyText}\n수정한 한글 본문`);
  await dialog.getByRole('button', { name: '수정 완료', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const detail = PostDetailSchema.parse(await (await page.request.get(`/api/posts/${post.id}`)).json());
  expect(detail.post.body).toBe(`${bodyText}\n수정한 한글 본문`);
  expect(richTextToPlainText(RichTextDocumentSchema.parse(detail.post.document))).toBe(detail.post.body);
});

test('mobile toolbar wraps and publishing remains reachable in a short keyboard viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const body = page.getByRole('textbox', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: '내용', exact: true });
  for (const button of await toolbar.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await toolbar.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await body.fill('휴대폰에서도 한글 초안을 유지합니다.');
  const mobileScreenshot = testInfo.outputPath('mobile-editor.png');
  await page.screenshot({ path: mobileScreenshot });
  await testInfo.attach('mobile-editor', { path: mobileScreenshot, contentType: 'image/png' });
  await page.getByLabel('분류', { exact: true }).selectOption('FEEDBACK');
  const feedbackBody = page.getByRole('textbox', { name: '플레이와 고민', exact: true });
  await expect(feedbackBody).toHaveText('휴대폰에서도 한글 초안을 유지합니다.');
  await feedbackBody.focus();
  await page.setViewportSize({ width: 360, height: 390 });
  const publish = page.getByRole('button', { name: '피드백 요청 올리기', exact: true });
  await expect(publish).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      feedbackBody.evaluate((node) => {
        const selection = window.getSelection();
        const scroll = node.closest('.page-form-scroll')?.getBoundingClientRect();
        if (!selection?.rangeCount || !node.contains(selection.anchorNode) || !scroll) return false;
        const caret = selection.getRangeAt(0).getBoundingClientRect();
        return (
          caret.height > 0 &&
          caret.top >= scroll.top &&
          caret.bottom <= scroll.bottom &&
          caret.left >= 0 &&
          caret.right <= innerWidth
        );
      }),
    )
    .toBe(true);
  await expect(page.locator('.site-footer:visible, .mobile-nav:visible')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const shortScreenshot = testInfo.outputPath('short-editor.png');
  await page.screenshot({ path: shortScreenshot });
  await testInfo.attach('short-editor', { path: shortScreenshot, contentType: 'image/png' });
});

test('HTML paste keeps text and HTTP links while dropping executable links and external media', async ({
  page,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const body = page.getByRole('textbox', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  await body.focus();
  await body.evaluate((node) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      'text/html',
      '<p>붙여넣은 본문 <a href="javascript:alert(1)">위험한 링크</a> <a href="https://example.com/safe">안전한 링크</a></p><img src="https://example.com/photo.jpg"><video src="data:video/mp4;base64,AAAA"></video><iframe src="https://example.com"></iframe>',
    );
    clipboard.setData('text/plain', '붙여넣은 본문 위험한 링크 안전한 링크');
    node.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
    );
  });
  await expect(body).toContainText('붙여넣은 본문');
  await expect(body).toContainText('위험한 링크');
  await expect(body.getByRole('link', { name: '안전한 링크', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/safe',
  );
  await expect(body.locator('img, video, iframe, script, a[href^="javascript:"]')).toHaveCount(0);
});

test('link dialog preserves the selected text, validates the URL and removes an existing link', async ({
  page,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const body = page.getByRole('textbox', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  await body.fill('링크를 적용할 한글');
  await body.press('ControlOrMeta+a');
  await page
    .getByRole('toolbar', { name: '내용', exact: true })
    .getByRole('button', { name: '링크', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '링크 주소', exact: true });
  await dialog.getByLabel('링크 주소', { exact: true }).fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(body.getByRole('link')).toHaveCount(0);
  await dialog.getByLabel('링크 주소', { exact: true }).fill('https://example.com/korean?q=1');
  await dialog.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const link = body.getByRole('link', { name: '링크를 적용할 한글', exact: true });
  await expect(link).toHaveAttribute('href', 'https://example.com/korean?q=1');
  await body.focus();
  await link.evaluate((node) => {
    const text = node.firstChild;
    if (!text) throw new Error('A link text node is required.');
    const range = document.createRange();
    // The boundary before a non-inclusive link is outside its mark. Place the
    // caret inside its text, as when editing an existing link with a pointer.
    range.setStart(text, 2);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const editLink = page
    .getByRole('toolbar', { name: '내용', exact: true })
    .getByRole('button', { name: '링크', exact: true });
  await expect(editLink).toHaveAttribute('aria-pressed', 'true');
  await editLink.click();
  await expect(dialog.getByLabel('링크 주소', { exact: true })).toHaveValue('https://example.com/korean?q=1');
  await dialog.getByRole('button', { name: '링크 제거', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(body.getByRole('link')).toHaveCount(0);
  await expect(body).toHaveText('링크를 적용할 한글');
  await expect(page).toHaveURL('/ko/write?board=free');
});
