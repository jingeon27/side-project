import { expect, test, type Locator } from '@playwright/test';

import { openGallery } from '../../../../../test/browser/gallery.fixture';

const cardName = '테스트 사진 8';
const menuName = `${cardName} 더보기`;

async function scrollToTrigger(trigger: Locator, spaceBelow = 20) {
  await trigger.evaluate((button, gap) => {
    window.scrollBy(0, button.getBoundingClientRect().bottom - window.innerHeight + gap);
  }, spaceBelow);
  await expect(trigger).toBeInViewport({ ratio: 0.99 });
}

test('아래로 스크롤한 뒤 공간이 충분하면 메뉴를 누른 아이콘 아래에 열어야 한다', async ({ page }) => {
  const { feed } = await openGallery(page);
  const trigger = feed.getByRole('button', { name: menuName, exact: true });
  await scrollToTrigger(trigger, 300);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  await trigger.click();
  const menu = page.getByRole('menu', { name: menuName, exact: true });
  await expect(menu).toBeInViewport({ ratio: 0.99 });
  const triggerBottom = await trigger.evaluate((button) => button.getBoundingClientRect().bottom);
  expect(await menu.evaluate((popup) => popup.getBoundingClientRect().top)).toBeGreaterThan(triggerBottom);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('스크롤한 화면의 하단에서는 메뉴를 위로 열어 모든 항목을 보여야 한다', async ({ page }) => {
  const { feed } = await openGallery(page);
  const trigger = feed.getByRole('button', { name: menuName, exact: true });
  await scrollToTrigger(trigger);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  await trigger.click();
  const menu = page.getByRole('menu', { name: menuName, exact: true });
  await expect(menu.getByRole('menuitem', { name: '수정' })).toBeInViewport({ ratio: 0.99 });
  await expect(menu.getByRole('menuitem', { name: '삭제' })).toBeInViewport({ ratio: 0.99 });
  const triggerTop = await trigger.evaluate((button) => button.getBoundingClientRect().top);
  const bounds = await menu.evaluate((popup) => {
    const { left, top, right, bottom } = popup.getBoundingClientRect();
    return { left, top, right, bottom, viewportWidth: window.innerWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThan(triggerTop);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('열린 메뉴 바깥을 누르면 닫혀야 한다', async ({ page }) => {
  const { feed, offsets } = await openGallery(page);
  const trigger = feed.getByRole('button', { name: menuName, exact: true });
  await scrollToTrigger(trigger);
  await trigger.click();
  const menu = page.getByRole('menu', { name: menuName, exact: true });
  await expect(menu).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(offsets).toEqual([0]);
});

test('삭제 항목을 누르면 메뉴가 닫히고 해당 게시물의 확인 대화상자가 열려야 한다', async ({ page }) => {
  const { feed, offsets } = await openGallery(page);
  const trigger = feed.getByRole('button', { name: menuName, exact: true });
  await scrollToTrigger(trigger);
  await trigger.click();
  const menu = page.getByRole('menu', { name: menuName, exact: true });
  await menu.getByRole('menuitem', { name: '삭제' }).click();
  await expect(menu).toBeHidden();
  const confirmation = page.getByRole('alertdialog', { name: '게시물을 삭제할까요?' });
  await expect(confirmation).toBeVisible();
  expect(offsets).toEqual([0]);
  await confirmation.getByRole('button', { name: '취소', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(feed.getByRole('article', { name: cardName, exact: true })).toBeVisible();
});

test('같은 더보기 아이콘을 다시 누르면 메뉴를 닫고 한 번 더 누르면 열어야 한다', async ({ page }) => {
  const { feed } = await openGallery(page);
  const trigger = feed.getByRole('button', { name: menuName, exact: true });
  await scrollToTrigger(trigger);
  await trigger.click();
  const menu = page.getByRole('menu', { name: menuName, exact: true });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await trigger.click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(menu).toBeVisible();
});
