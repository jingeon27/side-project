import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

test('피드 카드는 휴대폰·데스크톱에서 사진과 본문을 보존하고 키보드로 반응할 수 있어야 한다', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const directory = resolve('../../.data/brand');
  await mkdir(directory, { recursive: true });
  await page.goto('/?example=feed');
  const card = page.getByRole('article', { name: '잠깐 자리 비운 사이 소파 주인이 바뀌었다' }).first();
  for (const [width, height, name] of [
    [390, 844, 'mobile'],
    [1440, 1000, 'desktop'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(
      card.getByRole('img', { name: '잠깐 자리 비운 사이 소파 주인이 바뀌었다' }),
    ).toHaveJSProperty('complete', true);
    await expect(card.getByText('오늘도 집에서 가장 바쁜 건 고양이.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(directory, `feed-${name}.png`), fullPage: true });
  }
  const like = card.getByRole('button', { name: '잠깐 자리 비운 사이 소파 주인이 바뀌었다 좋아요' });
  await expect(like).toBeEnabled();
  await like.focus();
  await page.keyboard.press('Enter');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toContainText('좋아요 3개');
  expect(errors).toEqual([]);
});
