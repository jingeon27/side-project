import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';
const destination = '/ko/boards/coaching?coachingRole=STUDENT';
async function configureProviders(page: Page) {
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: {
        ...session,
        googleConfigured: true,
        socialProviders: [
          { provider: 'google', configured: true },
          { provider: 'kakao', configured: true },
          { provider: 'discord', configured: true },
          { provider: 'x', configured: true },
        ],
      },
    });
  });
}

test('mobile login is a dedicated page with branded buttons and returns to the original board', async ({
  page,
}, testInfo) => {
  await configureProviders(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(destination);
  await page.getByRole('button', { name: '코칭 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(destination);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await expect(page.locator('.shell-left-sidebar')).toBeHidden();
  await expect(page.locator('.topbar:visible .header-account:visible')).toHaveCount(0);
  const buttons = page.locator('.social-login-button');
  await expect(buttons).toHaveCount(4);
  await expect
    .poll(() =>
      buttons
        .locator('img')
        .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: '카카오 로그인', exact: true })).toHaveCSS(
    'background-color',
    'rgb(254, 229, 0)',
  );
  await expect(page.getByRole('button', { name: 'Discord로 시작하기', exact: true })).toHaveCSS(
    'background-color',
    'rgb(88, 101, 242)',
  );
  const heights = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 50)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('login-mobile-393.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const light = await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() => page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe(light);
  await page.screenshot({
    path: testInfo.outputPath('login-mobile-393-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 320, height: 690 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '돌아가기', exact: true }).click();
  await expect(page).toHaveURL(origin + destination);
});

test('desktop login stays in a centered dialog with focus recovery', async ({ page }, testInfo) => {
  await configureProviders(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ko');
  const write = page.locator('.feed-heading').getByRole('button', { name: '글쓰기', exact: true });
  await write.click();
  const dialog = page.getByRole('dialog', { name: '로그인', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.social-login-button')).toHaveCount(4);
  const box = await dialog.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(420);
  expect(box?.y).toBeGreaterThan(50);
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(write).toBeFocused();
  await expect(page).toHaveURL(origin + '/ko');
});

test('login keeps destination through language changes and returns after session refresh', async ({
  page,
}) => {
  await configureProviders(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/ko/login?returnTo=' + encodeURIComponent(destination));
  await page.getByRole('combobox', { name: '언어 설정', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/en/boards/coaching?coachingRole=STUDENT');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const issued = await page.request.post('/api/auth/test-token', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(issued.ok()).toBe(true);
  await page.reload();
  await expect(page).toHaveURL(origin + '/en/boards/coaching?coachingRole=STUDENT');
});

test('browser OAuth submits a validated login return path and unavailable providers stay disabled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/ko/login?returnTo=https%3A%2F%2Foutside.test');
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.social-login-button')
        .evaluateAll((nodes) => nodes.every((node) => (node as HTMLButtonElement).disabled)),
    )
    .toBe(true);
  await configureProviders(page);
  await page.reload();
  await page.route('**/api/auth/social/google?**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>OAuth request received</h1>' }),
  );
  const request = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/auth/social/google',
  );
  await page.getByRole('button', { name: 'Google로 시작하기', exact: true }).click();
  const url = new URL((await request).url());
  const loginReturn = new URL(url.searchParams.get('returnTo') ?? '', origin);
  expect(loginReturn.pathname).toBe('/ko/login');
  expect(loginReturn.searchParams.get('returnTo')).toBe('/ko');
});
