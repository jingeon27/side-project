import { expect, test } from '@playwright/test';

test('위아래 공간이 모두 부족하면 남은 높이 안에서 메뉴를 스크롤해 마지막 항목을 고를 수 있어야 한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 360 });
  // centered 레이아웃이 트리거를 화면 세로 가운데에 둬서 위아래 공간이 모두 메뉴보다 작다.
  await page.goto('/iframe.html?id=overlays-dropdownmenu--long-list&viewMode=story');
  await page.getByRole('button', { name: '서식 메뉴', exact: true }).click();
  const menu = page.getByRole('menu', { name: '서식 메뉴', exact: true });
  await expect(menu).toBeVisible();
  // 열림 전환의 scale이 끝난 뒤에 크기를 읽는다.
  await menu.evaluate((popup) => Promise.all(popup.getAnimations().map((animation) => animation.finished)));
  const rect = await menu.boundingBox();

  expect(rect).not.toBeNull();
  expect(rect?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((rect?.y ?? 0) + (rect?.height ?? Infinity)).toBeLessThanOrEqual(360);
  expect(await menu.evaluate((popup) => popup.scrollHeight > popup.clientHeight)).toBe(true);

  const last = menu.getByRole('menuitem', { name: '서식 12' });
  await expect(last).not.toBeInViewport();
  await menu.hover();
  await page.mouse.wheel(0, 1_000);
  await expect(last).toBeInViewport();
  await last.click();
  await expect(page.getByRole('status', { name: '고른 항목' })).toHaveText('서식 12');
});
