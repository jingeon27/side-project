import { expect, test } from './support/test';

for (const width of [360, 1440]) {
  test(`Korean composition hides the hint, commits once and preserves the draft at ${width}px`, async ({
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
    await expect.poll(placeholder).not.toBe('none');
    await body.focus();
    // These events exercise the browser editor's composition path. A physical
    // Korean keyboard and the operating system candidate UI need device testing.
    await body.dispatchEvent('compositionstart', { data: '' });
    await body.dispatchEvent('compositionupdate', { data: 'ㅎ' });
    await page.keyboard.insertText('ㅎ');
    await expect(body).toHaveText('ㅎ');
    await expect.poll(placeholder).toBe('none');
    await body.dispatchEvent('compositionend', { data: 'ㅎ' });
    await expect(body).toHaveText('ㅎ');
    await body.press('Backspace');
    await expect(body).toHaveText('');
    await expect.poll(placeholder).not.toBe('none');
    await body.dispatchEvent('compositionstart', { data: '' });
    await body.dispatchEvent('compositionupdate', { data: '한글' });
    await page.keyboard.insertText('한글');
    await body.dispatchEvent('compositionend', { data: '한글' });
    await expect(body).toHaveText('한글');
    await expect.poll(placeholder).toBe('none');
    await body.press('Enter');
    await page.keyboard.insertText('다음 줄');
    await expect(page).toHaveURL('/ko/write?board=free');
    await expect(body).toContainText('다음 줄');
    await page.getByLabel('분류', { exact: true }).selectOption('FEEDBACK');
    const feedbackBody = page.getByRole('textbox', { name: '플레이와 고민', exact: true });
    await expect(feedbackBody.locator('p')).toHaveText(['한글', '다음 줄']);
    await feedbackBody.fill('');
    await expect
      .poll(() => feedbackBody.evaluate((node) => getComputedStyle(node, '::before').content))
      .not.toBe('none');
    // Cancelling an empty composition restores the hint without adding text.
    await feedbackBody.dispatchEvent('compositionstart', { data: '' });
    await feedbackBody.dispatchEvent('compositionend', { data: '' });
    await expect(feedbackBody).toHaveText('');
    await expect
      .poll(() => feedbackBody.evaluate((node) => getComputedStyle(node, '::before').content))
      .not.toBe('none');
  });
}
