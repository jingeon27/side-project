import { expect, test } from './support/test';

for (const width of [320, 1440]) {
  test(`the first Korean character hides the placeholder during IME composition at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: 'http://127.0.0.1:3301' },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto('/ko/write?board=free');
    const body = page.getByRole('textbox', { name: '내용', exact: true });
    const placeholder = () => body.evaluate((node) => getComputedStyle(node, '::before').content);
    await expect(body).toBeVisible();
    expect(await placeholder()).not.toBe('none');
    await body.focus();
    await body.dispatchEvent('compositionstart', { data: '' });
    await page.keyboard.insertText('ㅎ');
    await expect(body).toContainText('ㅎ');
    // Quill deliberately keeps its empty model until compositionend.
    await expect(body).toHaveClass(/ql-blank/);
    await expect.poll(placeholder).toBe('none');
    await body.dispatchEvent('compositionend', { data: 'ㅎ' });
    await expect(body).not.toHaveClass(/ql-blank/);
    await expect.poll(placeholder).toBe('none');
    await body.fill('');
    await expect(body).toHaveClass(/ql-blank/);
    await expect.poll(placeholder).not.toBe('none');
    // Cancelling a composition in an empty editor restores the hint.
    await body.dispatchEvent('compositionstart', { data: '' });
    await body.dispatchEvent('compositionend', { data: '' });
    await expect.poll(placeholder).not.toBe('none');
    await body.fill('안');
    await expect.poll(placeholder).toBe('none');
    await page.getByLabel('분류', { exact: true }).selectOption('FEEDBACK');
    const feedbackBody = page.getByRole('textbox', { name: '플레이와 고민', exact: true });
    await expect(feedbackBody).toHaveText('안');
    expect(await feedbackBody.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('none');
  });
}
