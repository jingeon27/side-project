import { expect, test } from '@playwright/test';

test('소셜 로그인 버튼은 hover에도 제공자 배경과 읽을 수 있는 문구를 유지해야 한다', async ({ page }) => {
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: {
        ...session,
        socialProviders: ['google', 'kakao', 'discord', 'x'].map((provider) => ({
          provider,
          configured: true,
        })),
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko');
  await page.getByRole('button', { name: '로그인 / 시작하기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '로그인', exact: true });
  for (const [name, background] of [
    ['Google로 시작하기', 'rgb(255, 255, 255)'],
    ['카카오 로그인', 'rgb(254, 229, 0)'],
    ['Discord로 시작하기', 'rgb(88, 101, 242)'],
    ['X로 시작하기', 'rgb(17, 17, 17)'],
  ] as const) {
    const button = dialog.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toHaveCSS('background-color', background);
    await button.hover();
    await expect(button).toHaveCSS('background-color', background);
    await expect(button).toHaveCSS('text-decoration-line', 'none');
  }
  await page.unrouteAll({ behavior: 'wait' });
});
