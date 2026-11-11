import { expect, test, type Page } from '@playwright/test';

import { openGallery } from '../../../../../test/browser/gallery.fixture';

const cardName = '테스트 사진 8';

/** 처음에는 보이지 않는 카드까지 내려 더보기 아이콘 아래에 spaceBelow만큼 공간을 남긴다. */
async function scrollToCardMenu(
  page: Page,
  {
    card = cardName,
    spaceBelow = 20,
    ...gallery
  }: { card?: string; spaceBelow?: number } & Parameters<typeof openGallery>[1] = {},
) {
  const { feed, cards, offsets } = await openGallery(page, gallery);
  const name = `${card} 더보기`;
  const trigger = feed.getByRole('button', { name, exact: true });
  await trigger.evaluate((button, gap) => {
    window.scrollBy(0, button.getBoundingClientRect().bottom - window.innerHeight + gap);
  }, spaceBelow);
  await expect(trigger).toBeInViewport({ ratio: 0.99 });
  const menu = page.getByRole('menu', { name, exact: true });
  return { feed, cards, offsets, trigger, menu };
}

test('아래로 스크롤한 뒤 공간이 충분하면 메뉴를 누른 아이콘 아래에 열어야 한다', async ({ page }) => {
  const { trigger, menu } = await scrollToCardMenu(page, { spaceBelow: 300 });
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  await trigger.click();
  await expect(menu).toBeInViewport({ ratio: 0.99 });
  await expect(menu).toHaveAttribute('data-side', 'bottom');
  const triggerBottom = await trigger.evaluate((button) => button.getBoundingClientRect().bottom);
  expect(await menu.evaluate((popup) => popup.getBoundingClientRect().top)).toBeGreaterThan(triggerBottom);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('스크롤한 화면의 하단에서는 메뉴를 위로 열어 모든 항목을 보여야 한다', async ({ page }) => {
  const { trigger, menu } = await scrollToCardMenu(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  await trigger.click();
  await expect(menu.getByRole('menuitem', { name: '수정' })).toBeInViewport({ ratio: 0.99 });
  await expect(menu.getByRole('menuitem', { name: '삭제' })).toBeInViewport({ ratio: 0.99 });
  await expect(menu).toHaveAttribute('data-side', 'top');
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
  const { trigger, menu, offsets } = await scrollToCardMenu(page);
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(offsets).toEqual([0]);
});

test('삭제 항목을 누르면 메뉴가 닫히고 해당 게시물의 확인 대화상자가 열려야 한다', async ({ page }) => {
  const { feed, trigger, menu, offsets } = await scrollToCardMenu(page);
  await trigger.click();
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
  const { trigger, menu } = await scrollToCardMenu(page);
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await trigger.click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(menu).toBeVisible();
});

test('더보기 아이콘은 열려 있는 메뉴만 aria-controls로 가리켜야 한다', async ({ page }) => {
  const { trigger, menu } = await scrollToCardMenu(page);
  await expect(trigger).not.toHaveAttribute('aria-controls');
  await trigger.click();
  await expect(menu).toBeVisible();
  const menuId = await menu.getAttribute('id');
  expect(menuId).toBeTruthy();
  await expect(trigger).toHaveAttribute('aria-controls', menuId ?? '');
  await page.mouse.click(4, 4);
  await expect(menu).toHaveCount(0);
  await expect(trigger).not.toHaveAttribute('aria-controls');
});

test('키보드 Enter로 메뉴를 열면 첫 항목에 포커스를 주어야 한다', async ({ page }) => {
  const { trigger, menu } = await scrollToCardMenu(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '수정' })).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('키보드 아래 화살표로 구분선을 건너 다음 메뉴 항목으로 이동해야 한다', async ({ page }) => {
  const { trigger, menu } = await scrollToCardMenu(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('menuitem', { name: '수정' })).toBeFocused();
  // 구분선은 건너뛰고, 운영자 전용인 숨기기는 보이지 않아야 한다.
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: '삭제' })).toBeFocused();
  await expect(menu.getByRole('menuitem')).toHaveText(['수정', '삭제']);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('키보드 Escape로 메뉴를 닫으면 더보기 아이콘으로 포커스를 돌려야 한다', async ({ page }) => {
  const { trigger, menu } = await scrollToCardMenu(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('menuitem', { name: '수정' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('키보드로 삭제를 고른 뒤 확인 대화상자를 닫으면 더보기 아이콘으로 포커스를 돌려야 한다', async ({
  page,
}) => {
  const { feed, trigger, menu } = await scrollToCardMenu(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  const confirmation = page.getByRole('alertdialog', { name: '게시물을 삭제할까요?' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(feed.getByRole('article', { name: cardName, exact: true })).toBeVisible();
});

test('키보드로 닫는 메뉴는 전환 중 포인터 입력을 무시하고 전환이 끝난 뒤 제거되어야 한다', async ({
  page,
}) => {
  const { trigger, menu } = await scrollToCardMenu(page);
  await trigger.click();
  await expect(menu).not.toHaveAttribute('data-starting-style');
  await menu.evaluate((popup) => Promise.all(popup.getAnimations().map((animation) => animation.finished)));
  await expect(menu).toHaveCSS('opacity', '1');
  const remove = menu.getByRole('menuitem', { name: '삭제' });
  const box = await remove.boundingBox();
  expect(box).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  // 전환을 붙잡아 입력 검사와 메뉴 제거 시점을 테스트에서 정한다.
  await page.addStyleTag({ content: '[role="menu"] { transition-duration: 10s !important; }' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('data-ending-style');
  await expect.poll(() => menu.evaluate((popup) => popup.getAnimations().length)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      menu.evaluate((popup) => {
        const animations = popup.getAnimations();
        animations.forEach((animation) => animation.pause());
        return animations.length > 0 && animations.every((animation) => animation.playState === 'paused');
      }),
    )
    .toBe(true);
  await page.mouse.move(x, y);
  await expect(remove).not.toHaveAttribute('data-highlighted');
  await page.mouse.click(x, y);
  await expect(menu).toHaveCount(1);
  await expect(menu).toHaveAttribute('data-ending-style');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await menu.evaluate((popup) => popup.getAnimations().forEach((animation) => animation.finish()));
  await expect(menu).toHaveCount(0);
});

test('메뉴를 연 채로 다음 페이지가 붙어도 메뉴를 같은 자리에 열어 두어야 한다', async ({ page }) => {
  const response = Promise.withResolvers<'success'>();
  const { cards, offsets, trigger, menu } = await scrollToCardMenu(page, {
    card: '테스트 사진 24',
    spaceBelow: 300,
    responses: { 24: response.promise },
  });
  await expect.poll(() => offsets).toEqual([0, 24]);
  await trigger.click();
  await expect(menu).toHaveAttribute('data-side', 'bottom');
  const before = await menu.evaluate((popup) => popup.getBoundingClientRect().toJSON());
  response.resolve('success');
  await expect(cards).toHaveCount(26);
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await menu.evaluate((popup) => popup.getBoundingClientRect().toJSON())).toEqual(before);
});

test('메뉴를 연 채로 다음 페이지가 실패하면 메뉴와 스크롤 잠금을 정리하고 다시 시도할 수 있어야 한다', async ({
  page,
}) => {
  const response = Promise.withResolvers<'error'>();
  const { feed, cards, offsets, trigger, menu } = await scrollToCardMenu(page, {
    card: '테스트 사진 24',
    spaceBelow: 300,
    responses: { 24: response.promise },
  });
  await expect.poll(() => offsets).toEqual([0, 24]);
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  response.resolve('error');
  const error = feed.getByRole('alert');
  await expect(error).toContainText('불러오지 못했어요');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await error.getByRole('button', { name: '다시 시도' }).click();
  await expect(cards).toHaveCount(24);
  expect(offsets).toEqual([0, 24, 0]);
});
