import { expect, test, type Page } from '@playwright/test';

const destination = '/ko/boards/coaching?coachingRole=STUDENT';
const signup = '/ko/onboarding?returnTo=' + encodeURIComponent(destination);
// 문서 스트리밍 중에는 아직 옮겨지지 않은 숨김 세그먼트에 서버 폼이 함께 있어 접근성 트리 기준으로 찾는다.
const nicknameField = (page: Page) => page.getByRole('textbox', { name: '서비스 닉네임', exact: true });

test('mobile OAuth opens a signup page, permits reading terms, and completes back to the original board', async ({
  page,
  baseURL,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/ko/login?returnTo=' + encodeURIComponent(destination));
  await page.getByRole('button', { name: 'Google로 시작하기', exact: true }).click();
  await expect(page).toHaveURL(origin + signup);
  await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await expect(page.locator('.shell-left-sidebar')).toBeHidden();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.reload();
  await expect(nicknameField(page)).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '이용약관', exact: true }).click();
  const terms = await popupPromise;
  await expect(terms).toHaveURL(origin + '/ko/terms');
  await expect(
    terms.getByRole('heading', { name: '이용약관 (비공개 알파 초안)', exact: true }),
  ).toBeVisible();
  await terms.close();
  await expect(page).toHaveURL(origin + signup);

  await page.getByRole('textbox', { name: '플레이어 태그', exact: true }).fill('#QLLLPR89G');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결하지 않기', exact: true })).toBeVisible();
  const submit = page.getByRole('button', { name: '가입 완료하기', exact: true });
  await nicknameField(page).fill('초보메이트');
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox', { name: /이용약관/ }).check();
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox', { name: '만 14세 이상입니다.', exact: true }).check();
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('onboarding-mobile.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(nicknameField(page)).toHaveCSS('color', 'rgb(244, 241, 235)');
  await expect(submit).toHaveCSS('background-color', 'rgb(244, 241, 235)');
  await page.screenshot({ path: testInfo.outputPath('onboarding-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 690 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await submit.click();
  await expect(page).toHaveURL(origin + destination);
  const session = await (await page.request.get('/api/session')).json();
  expect(session.needsOnboarding).toBe(false);
  expect(session.user.nickname).toBe('초보메이트');
  expect(session.user.supercellTag).toBe('#QLLLPR89G');
  expect(session.user.isVerified).toBe(false);

  // A completed account must not see the signup form again, including a fresh server request.
  await page.goto(signup);
  await expect(page).toHaveURL(origin + destination);
  expect(pageErrors).toEqual([]);
});

test('desktop signup is a page, keeps the draft on failure, and preserves destination through locale changes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(destination);
  await page.getByRole('button', { name: '코칭 등록', exact: true }).click();
  await page
    .getByRole('dialog', { name: '로그인이 필요해요', exact: true })
    .getByRole('button', { name: '로그인하기', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '로그인', exact: true });
  await dialog.getByRole('button', { name: 'Google로 시작하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nicknameField(page).fill('테스트메이트');
  await page.getByRole('checkbox', { name: /이용약관/ }).check();
  await page.getByRole('checkbox', { name: '만 14세 이상입니다.', exact: true }).check();
  await page.route('**/api/auth/onboard', (route) =>
    route.fulfill({ status: 503, json: { code: 'TEST_FAILURE', message: '가입 테스트 실패' } }),
  );
  await page.getByRole('button', { name: '가입 완료하기', exact: true }).click();
  await expect(page.getByText('가입 테스트 실패', { exact: true })).toBeVisible();
  await expect(nicknameField(page)).toHaveValue('테스트메이트');
  await expect(page.getByRole('checkbox', { name: /이용약관/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '만 14세 이상입니다.', exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('onboarding-desktop.png'), fullPage: true });
  await page.unroute('**/api/auth/onboard');
  await page.getByRole('combobox', { name: '언어 설정', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign up', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/en/boards/coaching?coachingRole=STUDENT');
});

test('anonymous direct signup routes return to login with a safe destination', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  await page.goto(signup);
  await expect(page).toHaveURL(origin + '/ko/login?returnTo=' + encodeURIComponent(destination));
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  await expect(nicknameField(page)).toHaveCount(0);
  await page.goto('/ko/onboarding?returnTo=https%3A%2F%2Foutside.test');
  await expect(page).toHaveURL(origin + '/ko/login?returnTo=%2Fko');
});
