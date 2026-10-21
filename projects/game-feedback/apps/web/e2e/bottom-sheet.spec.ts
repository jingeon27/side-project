import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';
async function openAccountSheet(page: Page) {
  expect(
    (
      await page.request.post('/api/auth/test-token', {
        headers: { Origin: origin },
        data: { accountId: 'sample-user-0' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/ko/settings');
  await page.getByRole('button', { name: '계정 등록', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '게임 계정 등록', exact: true });
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => {
      const frame = await sheet.locator('.ds-sheet-frame').boundingBox();
      return frame ? Math.round(frame.y + frame.height) : null;
    })
    .toBe(page.viewportSize()?.height);
  return sheet;
}

test('sheet handle resizes without losing the draft and swiping down dismisses the sheet', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const sheet = await openAccountSheet(page);
  const handle = sheet.getByRole('slider', { name: '시트 높이 조절' });
  const input = sheet.getByLabel('플레이어 태그', { exact: true });
  await input.fill('#GG829JGY');
  await expect(handle).toHaveAttribute('aria-valuenow', '60');
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(handle).toHaveAttribute('aria-valuenow', '100');
  await expect.poll(async () => (await sheet.boundingBox())?.y).toBeLessThan(20);
  await expect(input).toHaveValue('#GG829JGY');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await sheet.boundingBox())?.y).toBeGreaterThan(250);
  await page.screenshot({ path: testInfo.outputPath('bottom-sheet-393.png'), animations: 'disabled' });
  const box = await handle.boundingBox();
  if (!box) throw new Error('Missing sheet drag handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 300, { steps: 25 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '100');
  await expect.poll(async () => (await sheet.boundingBox())?.y).toBeLessThan(20);
  await expect(input).toHaveValue('#GG829JGY');
  await handle.focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => (await sheet.boundingBox())?.y).toBeGreaterThan(250);
  const compact = await handle.boundingBox();
  if (!compact) throw new Error('Missing compact sheet handle');
  await page.mouse.move(compact.x + compact.width / 2, compact.y + compact.height / 2);
  await page.mouse.down();
  await page.mouse.move(compact.x + compact.width / 2, 840, { steps: 25 });
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: '계정 등록', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('touch dragging the handle expands the sheet while form controls remain usable', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const sheet = await openAccountSheet(page);
    const handle = sheet.getByRole('slider', { name: '시트 높이 조절' });
    const box = await handle.boundingBox();
    if (!box) throw new Error('Missing touch sheet handle');
    const cdp = await context.newCDPSession(page);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await Array.from({ length: 25 }, (_, index) => index + 1).reduce(async (previous, step) => {
      await previous;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - step * 12 }],
      });
    }, Promise.resolve());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(handle).toHaveAttribute('aria-valuenow', '100');
    await expect.poll(async () => (await sheet.boundingBox())?.y).toBeLessThan(20);
    await sheet.getByLabel('플레이어 태그', { exact: true }).fill('#GG829JGY');
    await expect(sheet.getByLabel('플레이어 태그', { exact: true })).toHaveValue('#GG829JGY');
    await sheet.getByRole('button', { name: '닫기', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
  } finally {
    await context.close();
  }
});
