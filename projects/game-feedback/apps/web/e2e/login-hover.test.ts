import { expect, test } from './support/test';

test('소셜 로그인 버튼은 hover와 누르는 동안에도 제공자 배경과 읽을 수 있는 문구를 유지해야 한다', async ({
  page,
}) => {
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: {
        ...session,
        socialProviders: ['google', 'kakao', 'discord'].map((provider) => ({
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
  ] as const) {
    const button = dialog.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toHaveCSS('background-color', background);
    await button.hover();
    await expect(button).toHaveCSS('background-color', background);
    await expect(button).toHaveCSS('text-decoration-line', 'none');
    // 공통 Button의 누름 바탕(sunken)이 뒤에 나와 이기면서 누르는 동안 회색이 됐다.
    await page.mouse.down();
    await expect(button).toHaveCSS('background-color', background);
    await expect(button).toHaveCSS('box-shadow', /inset/);
    // 같은 버튼 위에서 떼면 로그인 요청을 보내므로 대화 상자 제목으로 옮긴 뒤 뗀다.
    await dialog.getByRole('heading', { name: '로그인', exact: true }).hover();
    await page.mouse.up();
  }
  await page.unrouteAll({ behavior: 'wait' });
});
