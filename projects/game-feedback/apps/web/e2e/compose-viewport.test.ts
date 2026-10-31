import { expect, test } from './support/test';

for (const { height, largeText } of [
  { height: 360, largeText: false },
  { height: 420, largeText: true },
]) {
  test(`320×${height} ${largeText ? '확대 글자' : '짧은 화면'}에서도 인증 안내와 입력은 스크롤하고 제출은 하단에 남아야 한다`, async ({
    page,
  }, testInfo) => {
    const login = await page.request.post('/api/auth/demo', {
      headers: { Origin: 'http://127.0.0.1:3301' },
      data: { nickname: `폼배치_${height}_${Date.now().toString(36)}` },
    });
    expect(login.ok()).toBe(true);
    await page.setViewportSize({ width: 320, height });
    await page.goto('/ko/write');
    if (largeText) await page.addStyleTag({ content: ':root { --text-body: 18px; --text-caption: 16px; }' });
    const form = page.getByRole('form', { name: '글쓰기', exact: true });
    const prompt = page.getByRole('complementary', { name: '프로필 인증 안내', exact: true });
    const footer = form.locator('[data-sticky-cta]');
    const scroll = form.locator('[data-form-scroll]');
    await expect(form).toBeVisible();
    await expect(prompt).toBeVisible();
    await expect(async () => {
      const bounds = await footer.boundingBox();
      expect(bounds).not.toBeNull();
      expect(Math.abs((bounds?.y ?? 0) + (bounds?.height ?? 0) - height)).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 5_000 });
    await expect(footer).toBeInViewport({ ratio: 1 });
    const verification = prompt.getByRole('button', { name: '프로필 인증 신청', exact: true });
    await verification.scrollIntoViewIfNeeded();
    await expect(verification).toBeInViewport({ ratio: 1 });
    const title = form.getByRole('textbox', { name: /제목/ });
    await title.fill('작은 화면에서도 보존하는 초안');
    await scroll.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect(prompt).not.toBeInViewport();
    await expect(footer).toBeInViewport({ ratio: 1 });
    await expect(title).toHaveValue('작은 화면에서도 보존하는 초안');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('compose-viewport.png'), animations: 'disabled' });
  });
}
