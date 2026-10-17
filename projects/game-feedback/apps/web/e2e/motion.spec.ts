import { test, expect } from '@playwright/test';
import type { PostDetail } from '@game-feedback/contracts';

const origin = 'http://127.0.0.1:3301';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`interactions preserve keyboard controls, confirmed feedback and toast placement (${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: origin, reducedMotion });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('/ko');
      const card = page.locator('.post-card').first();
      await expect(card).toBeVisible();
      await card.hover();
      await expect
        .poll(() =>
          card.evaluate((node) => {
            const transform = getComputedStyle(node).transform;
            return Math.round(transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42);
          }),
        )
        .toBe(reducedMotion === 'reduce' ? 0 : -3);
      await page.mouse.move(0, 0);
      if (reducedMotion === 'no-preference') {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await card.hover();
        await expect
          .poll(() =>
            card.evaluate((node) => {
              const transform = getComputedStyle(node).transform;
              return Math.round(transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42);
            }),
          )
          .toBe(0);
        await page.mouse.move(0, 0);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }

      const unanswered = page.getByRole('button', { name: '답변 대기' });
      await unanswered.click();
      await expect(unanswered).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/tab=unanswered/);

      const compose = page.getByRole('button', { name: '글쓰기' });
      await compose.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(compose).toBeFocused();

      expect(
        (
          await context.request.post('/api/auth/test-login', {
            headers: { Origin: origin },
            data: { accountId: 'sample-user-0' },
          })
        ).ok(),
      ).toBe(true);
      const detail = (await (await context.request.get('/api/posts/sample-post-0')).json()) as PostDetail;
      const answer = detail.answers.find((item) => item.author.id !== 'sample-user-0');
      if (!answer) throw new Error('The sample post needs a feedback answer.');
      try {
        await page.goto('/ko/posts/sample-post-0');
        const helpful = page
          .locator('.answer-card')
          .filter({ hasText: answer.body })
          .locator('.helpful-button');
        await helpful.click();
        await expect(helpful).toHaveAttribute('aria-pressed', String(!answer.helpful));
        await page.setViewportSize({ width: 390, height: 844 });
        const status = page.locator('[data-sonner-toast]');
        await expect(status).toContainText(answer.helpful ? '도움됨 표시를 취소' : '마음을 전했어요');
        await expect
          .poll(() =>
            status.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2);
            }),
          )
          .toBeLessThan(1);
        await page.screenshot({ path: `test-results/motion-${reducedMotion}.png` });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
          .toBeLessThanOrEqual(0);
        const closeToast = status.getByRole('button', { name: '알림 닫기' });
        const closeBox = await closeToast.boundingBox();
        expect(closeBox?.width).toBeGreaterThanOrEqual(44);
        expect(closeBox?.height).toBeGreaterThanOrEqual(44);
        const toastBox = await status.boundingBox();
        const navBox = await page.locator('.mobile-nav').boundingBox();
        expect(toastBox && navBox && toastBox.y + toastBox.height <= navBox.y).toBe(true);
        await closeToast.click();
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
        await expect(page.locator('[data-sonner-toaster]')).toBeEmpty();
        expect(errors).toEqual([]);
      } finally {
        expect(
          (
            await context.request.post(`/api/answers/${answer.id}/helpful`, {
              headers: { Origin: origin },
              data: { helpful: answer.helpful },
            })
          ).ok(),
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
}
