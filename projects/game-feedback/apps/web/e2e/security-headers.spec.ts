import { expect, test } from './support/test';

test('public documents refuse framing and send conservative browser security headers', async ({ page }) => {
  for (const path of ['/ko', '/ko/guide', '/ko/posts/sample-post-0', '/ko/posts/missing-document']) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy'], path).toContain('camera=()');
    expect(headers['x-powered-by'], path).toBeUndefined();
  }
  // CSP가 Next 스크립트를 막지 않아 화면이 hydration까지 동작해야 한다.
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text()))
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 400, height: 844 });
  await page.goto('/ko/guide');
  await page
    .getByRole('navigation', { name: '모바일 메뉴' })
    .getByRole('link', { name: '채팅', exact: true })
    .click();
  await expect(page).toHaveURL('/ko/messages');
  expect(errors).toEqual([]);
});
