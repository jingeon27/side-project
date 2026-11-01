import { expect, test } from './support/test';

for (const width of [320, 390, 430, 1440]) {
  test(`${width}px 공개 랜딩은 커뮤니티 요청 없이 소개와 시작 버튼을 보여준다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('혼자 막힌 플레이,함께 풀어봐요.');
    await expect(page.getByRole('banner').getByRole('link', { name: '시작하기' })).toHaveAttribute(
      'href',
      '/ko',
    );
    await expect(page.getByRole('complementary').getByRole('link')).toHaveCount(5);
    await expect(page.locator('.shell-left-sidebar, .mobile-nav, .floating-compose-button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(requests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('landing.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: testInfo.outputPath('landing-dark.png') });
  });
}

test('시작하기는 기본 피드와 지정한 게시판으로 연결하고 외부 주소는 거부한다', async ({ page }) => {
  await page.goto('/about');
  await page.getByRole('region', { name: 'Game Mate 소개' }).getByRole('link', { name: '시작하기' }).click();
  await expect(page).toHaveURL('/ko');
  await expect(page.getByRole('heading', { name: '전체', exact: true })).toBeVisible();
  await page.goto(`/about?${new URLSearchParams({ redirect: '/en/boards/free' })}`);
  await page.getByRole('banner').getByRole('link', { name: '시작하기' }).click();
  await expect(page).toHaveURL('/en/boards/free');
  await page.goto(`/about?${new URLSearchParams({ redirect: '//outside.example/private' })}`);
  await expect(page.getByRole('banner').getByRole('link', { name: '시작하기' })).toHaveAttribute(
    'href',
    '/ko',
  );
});

test('랜딩 헤더는 내려갈 때 숨고 올라갈 때 나타나며 숨은 동안 포커스를 받지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/about');
  const header = page.getByRole('banner');
  await expect(header).not.toHaveAttribute('inert');
  await page.mouse.wheel(0, 600);
  await expect(header).toHaveAttribute('inert', '');
  await page.mouse.wheel(0, -120);
  await expect(header).not.toHaveAttribute('inert');
});

test('공개 소개의 본문과 정책 링크, 메타데이터는 JavaScript 없이도 읽힌다', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '서비스 정책' }).getByRole('link')).toHaveCount(4);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://feedback.example/about',
    );
    const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(structuredData ?? '{}')).toMatchObject({ '@type': 'WebPage', name: 'Game Mate 소개' });
  } finally {
    await context.close();
  }
});
