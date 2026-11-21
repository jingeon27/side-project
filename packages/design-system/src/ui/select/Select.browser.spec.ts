import { expect, test } from '@playwright/test';

test('좁은 선택 상자에서 긴 값은 한 줄로, 펼친 옵션은 전체 문구로 보인다', async ({ page }) => {
  await page.goto('/iframe.html?id=forms-select--long-labels&viewMode=story');
  const trigger = page.getByRole('combobox', { name: '알림 주기' });
  const value = trigger.locator('[data-slot="select-value"]');
  await expect(value).toBeVisible();
  expect(await value.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await expect(value).toHaveCSS('text-overflow', 'ellipsis');

  await trigger.click();
  const selected = page.getByRole('option', { selected: true });
  const short = page.getByRole('option', { name: '활동이 생길 때마다 바로 알림 받기' });
  const text = selected.getByText('참여한 프로젝트에 달린 새 댓글과 피드백을 매주 한 번 모아서 받기');
  await expect(text).toBeVisible();
  expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect((await selected.boundingBox())?.height).toBeGreaterThan((await short.boundingBox())?.height ?? 0);
  await short.click();
  await expect(value).toHaveText('활동이 생길 때마다 바로 알림 받기');
});
