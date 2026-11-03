import { expect, seedGroup, test } from './support/test';
import { landingScreens } from './support/web-screens';

test('소개 화면의 주 버튼은 크기가 같고 상단 안내와 시작하기는 간격을 유지해야 한다 @desktop @ios', async ({
  page,
}) => {
  await page.goto('/about');
  await expect(landingScreens.hero(page)).toBeVisible();
  const start = await landingScreens.startLink(page).evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });
  const guide = await landingScreens.howItWorksLink(page).evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });
  expect(start.width).toBeCloseTo(guide.width, 1);
  expect(start.height).toBeCloseTo(guide.height, 1);
  const guideRight = await landingScreens
    .headerGuide(page)
    .evaluate((element) => element.getBoundingClientRect().right);
  const startLeft = await landingScreens
    .headerStart(page)
    .evaluate((element) => element.getBoundingClientRect().left);
  expect(startLeft - guideRight).toBeGreaterThanOrEqual(16);
});

test('공개 랜딩과 이용 방법은 로그인·API 요청 없이 읽고 서로 이동할 수 있어야 한다 @desktop @ios', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/backend/')) apiRequests.push(request.url());
  });
  await page.goto('/about');
  await expect(landingScreens.hero(page)).toBeVisible();
  await expect(landingScreens.appNavigation(page)).toHaveCount(0);
  await landingScreens.howItWorksLink(page).click();
  await expect(page).toHaveURL('/about/how-it-works');
  await expect(landingScreens.howItWorksHero(page)).toBeVisible();
  await expect(landingScreens.privateGroupHeading(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);
});

test('랜딩의 시작하기는 인증 없이 피드로 이어져야 한다 @desktop @ios', async ({ page }) => {
  await page.goto('/about');
  await landingScreens.startLink(page).click();
  await expect(page).toHaveURL('/');
  await expect(landingScreens.feedHeading(page)).toBeVisible();
  await expect(landingScreens.anonymousStart(page)).toHaveCount(0);
});

for (const placement of ['header', 'hero'] as const) {
  test(`${placement} 시작하기는 redirect의 그룹으로 바로 이동한다 @desktop @ios`, async ({
    page,
    context,
    signIn,
  }) => {
    const owner = await signIn(`landing-${placement}`);
    const group = await seedGroup(owner, `랜딩에서 만난 그룹 ${placement}`);
    await context.clearCookies();
    const destination = `/groups/${group.id}`;
    await page.goto(`/about?${new URLSearchParams({ redirect: destination })}`);
    const start = placement === 'header' ? landingScreens.headerStart(page) : landingScreens.startLink(page);
    await expect(start).toHaveAttribute('href', destination);
    await start.click();
    await expect(page).toHaveURL(destination);
    await expect(landingScreens.groupHeading(page)).toHaveText(`랜딩에서 만난 그룹 ${placement}`);
  });
}

test('외부 redirect는 홈으로 되돌리고 이용 방법도 같은 시작 경로를 사용한다 @desktop @ios', async ({
  page,
}) => {
  await page.goto(`/about?${new URLSearchParams({ redirect: '//outside.example/path' })}`);
  await expect(landingScreens.startLink(page)).toHaveAttribute('href', '/');
  await expect(landingScreens.headerStart(page)).toHaveAttribute('href', '/');
  await page.goto(`/about/how-it-works?${new URLSearchParams({ redirect: '/groups/target-group' })}`);
  await expect(landingScreens.startLink(page)).toHaveAttribute('href', '/groups/target-group');
});
