import { errors, expect, test, type Page } from '@playwright/test';

import { openGallery } from '../../../../test/browser/gallery.fixture';

async function scrollPastEnd(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight + innerHeight));
}

function expectNoGalleryRequest(page: Page) {
  return expect(page.waitForRequest('**/__test__/gallery', { timeout: 1_000 })).rejects.toBeInstanceOf(
    errors.TimeoutError,
  );
}

test('첫 응답을 기다리는 동안 스켈레톤을 표시하고 응답 뒤에 첫 페이지를 보여야 한다', async ({ page }) => {
  const response = Promise.withResolvers<'success'>();
  const { feed, cards, offsets } = await openGallery(page, { responses: { 0: response.promise } });
  const skeleton = feed.locator('[aria-hidden="true"].animate-pulse');
  await expect(skeleton).toBeVisible();
  await expect(cards).toHaveCount(0);
  await expect.poll(() => offsets).toEqual([0]);
  await Promise.all([expectNoGalleryRequest(page), scrollPastEnd(page)]);
  expect(offsets).toEqual([0]);
  response.resolve('success');
  await expect(cards).toHaveCount(24);
  await expect(skeleton).toBeHidden();
  expect(offsets).toEqual([0]);
});

test('추가 조회 중 기존 목록을 유지하고 다시 스크롤해도 중복 요청하지 않아야 한다', async ({ page }) => {
  const response = Promise.withResolvers<'success'>();
  const { feed, cards, offsets } = await openGallery(page, { responses: { 24: response.promise } });
  const loading = feed.getByRole('status').filter({ hasText: '게시물을 더 불러오는 중' });
  await expect(cards).toHaveCount(24);
  await scrollPastEnd(page);
  await expect(loading).toBeVisible();
  await expect(cards.first()).toHaveAccessibleName('테스트 사진 1');
  await expect(cards).toHaveCount(24);
  await cards.first().scrollIntoViewIfNeeded();
  await Promise.all([expectNoGalleryRequest(page), scrollPastEnd(page)]);
  expect(offsets).toEqual([0, 24]);

  response.resolve('success');
  await expect(cards).toHaveCount(26);
  await expect(cards.last()).toHaveAccessibleName('테스트 사진 26');
  await expect(loading).toBeHidden();
});

test('마지막 페이지가 24개로 꽉 차도 nextOffset이 null이면 요청을 멈춰야 한다', async ({ page }) => {
  const { cards, offsets } = await openGallery(page, { lastPageSize: 24 });
  await expect(cards).toHaveCount(24);
  await scrollPastEnd(page);
  await expect(cards).toHaveCount(48);
  await expect(cards.last()).toHaveAccessibleName('테스트 사진 48');
  await Promise.all([
    expectNoGalleryRequest(page),
    scrollPastEnd(page).then(() => page.mouse.wheel(0, 3_000)),
  ]);
  await expect
    .poll(() => page.evaluate(() => Math.abs(document.documentElement.scrollHeight - innerHeight - scrollY)))
    .toBeLessThanOrEqual(1);
  expect(offsets).toEqual([0, 24]);
});

test('첫 조회가 실패하면 오류를 표시하고 다시 시도해서 첫 페이지를 받아야 한다', async ({ page }) => {
  const { feed, cards, offsets } = await openGallery(page, { responses: { 0: Promise.resolve('error') } });
  const error = feed.getByRole('alert');
  await expect(error).toContainText('불러오지 못했어요');
  await expect(cards).toHaveCount(0);
  expect(offsets).toEqual([0]);
  await error.getByRole('button', { name: '다시 시도' }).click();
  await expect(cards).toHaveCount(24);
  await expect(error).toBeHidden();
  expect(offsets).toEqual([0, 0]);
});

test('스크롤 중 다음 조회가 실패하면 목록 오류에서 다시 조회하고 끝까지 이어 읽어야 한다', async ({
  page,
}) => {
  const { feed, cards, offsets } = await openGallery(page, { responses: { 24: Promise.resolve('error') } });
  const error = feed.getByRole('alert');
  await expect(cards).toHaveCount(24);
  await scrollPastEnd(page);
  await expect(error).toContainText('불러오지 못했어요');
  await expect(cards).toHaveCount(0);
  expect(offsets).toEqual([0, 24]);

  await error.getByRole('button', { name: '다시 시도' }).click();
  await expect(cards).toHaveCount(24);
  await expect(error).toBeHidden();
  await scrollPastEnd(page);
  await expect(cards).toHaveCount(26);
  expect(offsets).toEqual([0, 24, 0, 24]);
});
