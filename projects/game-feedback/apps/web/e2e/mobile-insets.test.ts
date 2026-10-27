import { expect, test } from '@playwright/test';

for (const width of [320, 393, 430, 760]) {
  test(`${width}px 전체 화면의 본문·상단바·하단 안내는 좌우 여백을 맞춰야 한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/ko', '/ko/guide', '/ko/settings']) {
      await page.goto(path);
      const main = page.getByRole('main');
      await expect(main).toBeVisible();
      const bounds = await page.evaluate(() => {
        const content = document.querySelector('.site-grid > main');
        const header = document.querySelector('.topbar-inner');
        const footer = document.querySelector('.site-footer-inner');
        if (!content || !header || !footer) throw new Error('화면 영역을 찾을 수 없습니다.');
        const main = content.getBoundingClientRect();
        const inset = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: rect.left + Number.parseFloat(style.paddingLeft),
            right: document.documentElement.clientWidth - rect.right + Number.parseFloat(style.paddingRight),
          };
        };
        return {
          main: { left: main.left, right: document.documentElement.clientWidth - main.right },
          header: inset(header),
          footer: inset(footer),
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(bounds.main.left, path).toBeGreaterThanOrEqual(16);
      expect(bounds.main.right, path).toBeGreaterThanOrEqual(16);
      expect(Math.abs(bounds.main.left - bounds.main.right), path).toBeLessThanOrEqual(1);
      for (const region of [bounds.header, bounds.footer]) {
        expect(Math.abs(region.left - bounds.main.left), path).toBeLessThanOrEqual(1);
        expect(Math.abs(region.right - bounds.main.right), path).toBeLessThanOrEqual(1);
      }
      expect(bounds.scrollWidth, path).toBeLessThanOrEqual(bounds.width);
      if (path === '/ko') {
        const chips = page.locator('.game-board-chips:visible');
        expect(await chips.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        for (const chip of await chips.getByRole('link').all())
          await expect(chip).toBeInViewport({ ratio: 1 });
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`page-insets-${width}.png`), animations: 'disabled' });
  });
}

for (const width of [320, 393, 430, 557, 650, 760]) {
  test(`${width}px 게시글·프로필·대화 목록은 카드 안에서 내용을 정렬하고 가로로 넘치지 않는다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';
    const login = await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    await page.goto('/ko');
    const title = page.locator('.post-card h3').first();
    await expect(title).toBeVisible();
    const baseline = (await title.boundingBox())?.x;
    expect(baseline).toBeDefined();
    for (const { path, content } of [
      { path: '/ko', content: '.post-card h3' },
      { path: '/ko/settings', content: '.settings-profile' },
      { path: '/ko/settings', content: '#language-title' },
      { path: '/ko/messages', content: '.conversation-list-heading h2' },
      { path: '/ko/messages', content: '.conversation-row > .avatar' },
    ]) {
      await page.goto(path);
      await expect(page.locator(content).first()).toBeVisible();
      const bounds = await page.evaluate((selector) => {
        const main = document.querySelector('main');
        const content = document.querySelector(selector);
        if (!main || !content) throw new Error('콘텐츠 기준선을 찾을 수 없습니다.');
        return {
          main: main.getBoundingClientRect().left,
          content: content.getBoundingClientRect().left,
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      }, content);
      expect(bounds.content, `${path}: ${content}`).toBeGreaterThan(bounds.main);
      expect(Math.abs(bounds.content - (baseline ?? 0)), `${path}: ${content}`).toBeLessThanOrEqual(1);
      expect(bounds.scrollWidth, path).toBeLessThanOrEqual(bounds.width);
      if (
        width === 393 &&
        ['.post-card h3', '.settings-profile', '.conversation-row > .avatar'].includes(content)
      )
        await page.screenshot({
          path: testInfo.outputPath(`${path.split('/').at(-1) || 'home'}.png`),
          animations: 'disabled',
        });
    }
  });
}

for (const width of [320, 393, 557, 760, 768, 1024, 1440]) {
  test(`${width}px 하단 메뉴로 홈·프로필·채팅을 오가도 가로 스크롤이 생기지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/ko');
    for (const path of ['/ko/settings', '/ko/messages', '/ko']) {
      if (width <= 760) {
        await page.locator(`.mobile-nav:visible a[href="${path}"]`).click();
        await expect(page).toHaveURL(path);
      }
      if (width > 760) await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);
    }
  });
}
