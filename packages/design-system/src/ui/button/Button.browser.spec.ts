import { expect, test } from '@playwright/test';

test('문구가 같은 버튼은 대기 중에도 너비와 레이블을 유지한다', async ({ page }) => {
  const story = '/iframe.html?id=actions-button--default&viewMode=story';
  await page.goto(story);
  const button = page.getByRole('button', { name: '저장하기' });
  await expect(button).toBeVisible();
  const idleWidth = await button.evaluate((node) => node.getBoundingClientRect().width);
  await page.goto(`${story}&args=loading:true`);
  await expect(button).toHaveAttribute('aria-busy', 'true');
  const progress = button.locator('[data-slot="button-progress"]');
  await expect(progress).toBeVisible();
  expect(await button.evaluate((node) => node.getBoundingClientRect().width)).toBe(idleWidth);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await progress.evaluate((node) => getComputedStyle(node, '::after').animationName)).toBe('none');
});
