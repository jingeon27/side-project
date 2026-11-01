import { mkdir } from 'node:fs/promises';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '참여 그룹이 없는 홈의 고정 버튼은 선택 단계 없이 그룹 만들기로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('홈 첫 그룹 만들기');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const button = page.getByRole('button', { name: '그룹 만들기', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute('data-compose-entry', 'true');
    await expect(button).toBeInViewport({ ratio: 1 });
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/home-compose-${testInfo.project.name}-zero-idle.png`,
      scale: 'css',
    });
    await button.click();
    await expect(page).toHaveURL('/groups/new');
    await expect(page.getByRole('form', { name: '그룹 만들기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-compose-entry]')).toHaveCount(0);
    for (const path of ['/me', '/notifications']) {
      await page.goto(path);
      await expect(page.locator('[data-compose-entry]')).toHaveCount(0);
    }
  },
);

test(
  '홈 글쓰기 시트는 작은 화면과 데스크톱에서 키보드와 터치로 열고 닫으며 선택 즉시 그룹을 만들어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, isMobile }, testInfo) => {
    const cookie = await signIn('홈 글쓰기 접근성');
    await seedGroup(cookie, '접근성 확인 그룹');
    await page.goto('/');
    const button = page.getByRole('button', { name: '글쓰기', exact: true });
    const sheet = page.getByRole('dialog', { name: '글쓰기', exact: true });
    await mkdir('.data/screens', { recursive: true });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(button).toHaveAttribute('data-compact', 'false');
      const bounds = await button.boundingBox();
      if (!bounds) throw new Error('홈 글쓰기 버튼이 보여야 한다');
      expect(bounds.width).toBeGreaterThanOrEqual(100);
      expect(bounds.height).toBeGreaterThanOrEqual(48);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      if (width < 768) {
        const navigation = await page
          .getByRole('navigation', { name: '주요 메뉴', exact: true })
          .boundingBox();
        if (!navigation) throw new Error('모바일 하단 메뉴가 보여야 한다');
        expect(bounds.y + bounds.height).toBeLessThan(navigation.y);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({
        path: `.data/screens/home-compose-${testInfo.project.name}-${width}-idle.png`,
        scale: 'css',
      });
      if (isMobile) await button.tap();
      if (!isMobile) await button.click();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('button', { name: '그룹 만들기', exact: true })).toBeVisible();
      await expect(sheet.getByRole('button', { name: '게시글 작성', exact: true })).toBeVisible();
      await expect(sheet.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
      await expect(sheet.getByRole('button', { name: '취소', exact: true })).toHaveCount(0);
      await expect(async () => {
        const box = await sheet.boundingBox();
        if (!box) throw new Error('글쓰기 시트가 보여야 한다');
        expect(box.height).toBeLessThan(450);
        if (width < 768) {
          expect(Math.abs(box.x)).toBeLessThan(2);
          expect(Math.abs(box.width - width)).toBeLessThan(2);
          expect(Math.abs(box.y + box.height - 900)).toBeLessThan(2);
        }
      }).toPass();
      for (const step of [1, 2, 3, 4, 5, 6]) {
        await page.keyboard.press(step % 2 ? 'Tab' : 'Shift+Tab');
        await expect
          .poll(() => sheet.evaluate((element) => element.contains(document.activeElement)))
          .toBe(true);
      }
      await page.screenshot({
        path: `.data/screens/home-compose-${testInfo.project.name}-${width}-sheet.png`,
        scale: 'css',
      });
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(button).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: '닫기', exact: true }).click();
      await expect(sheet).toHaveCount(0);
      await expect(button).toBeFocused();
    }
    await page.keyboard.press('Enter');
    await sheet.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL('/groups/new');
    await expect(page.getByRole('form', { name: '그룹 만들기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  },
);

test(
  '참여 그룹이 하나면 게시글 작성을 누르는 즉시 해당 그룹 글쓰기 페이지로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('홈 단일 그룹 글쓰기');
    const group = await seedGroup(cookie, '하나뿐인 참여 그룹');
    await page.goto('/');
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '글쓰기', exact: true });
    await sheet.getByRole('button', { name: '게시글 작성', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-compose-entry]')).toHaveCount(0);
  },
);

test(
  '참여 그룹이 여러 개면 짧은 그룹 선택 시트에서 누른 그룹의 글쓰기로 바로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const cookie = await signIn('홈 여러 그룹 글쓰기');
    const first = await seedGroup(cookie, '선택할 첫 그룹');
    const second = await seedGroup(cookie, '선택할 비공개 그룹', 'PRIVATE');
    const outsider = await createTestUser(API_URL, { nickname: '가입 밖 그룹장', origin: WEB_ORIGIN });
    await seedGroup(outsider, '가입하지 않은 그룹');
    await page.goto('/');
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    await page
      .getByRole('dialog', { name: '글쓰기', exact: true })
      .getByRole('button', { name: '게시글 작성', exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: '게시글을 올릴 그룹', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: '선택할 첫 그룹', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '선택할 비공개 그룹', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '가입하지 않은 그룹', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '게시글 작성', exact: true })).toHaveCount(0);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/home-compose-${testInfo.project.name}-groups.png`,
      scale: 'css',
    });
    await sheet.getByRole('button', { name: '선택할 비공개 그룹', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${second.id}/write`);
    await expect(page).not.toHaveURL(`/groups/${first.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  },
);

test(
  '홈 고정 글쓰기 버튼은 스크롤 중 더하기로 줄었다가 멈추면 문구를 복원해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, browserName, isMobile }, testInfo) => {
    const cookie = await signIn('홈 스크롤 글쓰기');
    const group = await seedGroup(cookie, '스크롤 확인 그룹');
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await productRequest(
        cookie,
        'mutation($groupId: ID!, $title: String!, $body: String!) { createPost(groupId: $groupId, title: $title, body: $body, linkUrl: "https://example.com/home-compose", rightsConfirmed: true) { id } }',
        {
          groupId: group.id,
          title: `스크롤 확인 게시물 ${index}`,
          body: '우리 그룹의 일상과 웃긴 순간을 함께 나눠요. '.repeat(20),
        },
      );
    }
    await page.goto('/');
    const button = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(button).toBeEnabled();
    await expect(
      page.getByRole('region', { name: '최신 게시물', exact: true }).getByRole('article'),
    ).toHaveCount(8);
    const idle = await button.boundingBox();
    if (!idle) throw new Error('홈 글쓰기 버튼이 보여야 한다');
    if (browserName === 'chromium' && isMobile) {
      const session = await page.context().newCDPSession(page);
      const viewport = page.viewportSize();
      if (!viewport) throw new Error('모바일 화면 크기가 있어야 한다');
      const point = { x: viewport.width / 2, y: viewport.height * 0.75 };
      try {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        for (const step of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: point.x, y: point.y - step * 35 }],
          });
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
        }
        await expect(button).toHaveAttribute('data-compact', 'true');
        const compact = await button.boundingBox();
        if (!compact) throw new Error('스크롤 중에도 글쓰기 버튼이 보여야 한다');
        expect(compact.width).toBeLessThan(idle.width - 20);
        await mkdir('.data/screens', { recursive: true });
        await page.screenshot({
          path: `.data/screens/home-compose-${testInfo.project.name}-scroll.png`,
          scale: 'css',
        });
      } finally {
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      }
    }
    if (browserName !== 'chromium' || !isMobile) {
      await page.evaluate(() => window.scrollTo(0, 480));
      await expect(button).toHaveAttribute('data-compact', 'true');
    }
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await expect(button).toHaveAttribute('data-compact', 'false');
    await expect(async () => {
      const restored = await button.boundingBox();
      if (!restored) throw new Error('정지 후 글쓰기 버튼이 보여야 한다');
      expect(Math.abs(restored.width - idle.width)).toBeLessThan(2);
      expect(Math.abs(restored.y - idle.y)).toBeLessThan(2);
    }).toPass();
    await expect(button).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);

test(
  '참여 그룹이 없는 탐색은 검색을 유지하고 헤더 대신 고정 그룹 만들기 버튼에서 바로 생성해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('탐색 첫 그룹 만들기');
    const owner = await createTestUser(API_URL, { nickname: '탐색 검색 그룹장', origin: WEB_ORIGIN });
    const name = `탐색 검색 유지 ${testInfo.project.name}`;
    await seedGroup(owner, name);
    await seedGroup(owner, `검색에 포함되지 않을 그룹 ${testInfo.project.name}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: '그룹 탐색', exact: true })).toBeVisible();
    await expect(
      page.locator('header').getByRole('button', { name: '그룹 만들기', exact: true }),
    ).toHaveCount(0);
    const search = page.getByRole('search').getByRole('textbox', { name: '그룹 검색', exact: true });
    await search.fill(name);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/explore' && url.searchParams.get('q') === name);
    await expect(search).toHaveValue(name);
    const results = page.getByRole('region', { name: '탐색할 그룹', exact: true });
    await expect(results.getByRole('article')).toHaveCount(1);
    await expect(results.getByRole('link', { name, exact: true })).toBeVisible();
    const button = page.getByRole('button', { name: '그룹 만들기', exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toBeVisible();
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute('data-compose-entry', 'true');
    await expect(button).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/explore-compose-${testInfo.project.name}-zero-idle.png`,
      scale: 'css',
    });
    await button.click();
    await expect(page).toHaveURL('/groups/new');
    await expect(page.getByRole('form', { name: '그룹 만들기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  },
);

test(
  '참여 그룹이 하나인 탐색의 글쓰기 시트는 검색어와 포커스를 보존하고 해당 그룹 작성 페이지로 바로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('탐색 단일 그룹 글쓰기');
    const name = '탐색 단일 참여 그룹';
    const group = await seedGroup(cookie, name);
    await page.goto(`/explore?q=${encodeURIComponent(name)}`);
    await expect(
      page.locator('header').getByRole('button', { name: '그룹 만들기', exact: true }),
    ).toHaveCount(0);
    const button = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(button).toBeEnabled();
    await button.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: '글쓰기', exact: true });
    await expect(sheet.getByRole('button', { name: '그룹 만들기', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '게시글 작성', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(page.getByRole('textbox', { name: '그룹 검색', exact: true })).toHaveValue(name);
    await expect(page).toHaveURL((url) => url.pathname === '/explore' && url.searchParams.get('q') === name);
    await page.keyboard.press('Enter');
    await sheet.getByRole('button', { name: '게시글 작성', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  },
);

test(
  '탐색 고정 글쓰기 버튼도 스크롤에 맞춰 줄고 참여한 여러 그룹 중 선택한 작성 페이지로 바로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, isMobile }, testInfo) => {
    const cookie = await signIn('탐색 여러 그룹 글쓰기');
    const prefix = `탐색 FAB ${testInfo.project.name}`;
    await seedGroup(cookie, `${prefix} 첫 그룹`);
    const second = await seedGroup(cookie, `${prefix} 비공개 그룹`, 'PRIVATE');
    const owner = await createTestUser(API_URL, { nickname: '탐색 목록 그룹장', origin: WEB_ORIGIN });
    for (const index of Array.from({ length: 22 }, (_, index) => index + 1)) {
      await seedGroup(owner, `${prefix} 외부 그룹 ${index}`);
    }
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 900 });
    await page.goto(`/explore?q=${encodeURIComponent(prefix)}`);
    await expect(
      page.locator('header').getByRole('button', { name: '그룹 만들기', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: '탐색할 그룹', exact: true }).getByRole('article'),
    ).toHaveCount(24);
    const button = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(button).toHaveAttribute('data-compact', 'false');
    const idle = await button.boundingBox();
    if (!idle) throw new Error('탐색 글쓰기 버튼이 보여야 한다');
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/explore-compose-${testInfo.project.name}-idle.png`,
      scale: 'css',
    });
    await page.evaluate(() => window.scrollTo(0, 480));
    await expect(button).toHaveAttribute('data-compact', 'true');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await expect(button).toHaveAttribute('data-compact', 'false');
    await expect(async () => {
      const restored = await button.boundingBox();
      if (!restored) throw new Error('탐색 스크롤 정지 후 글쓰기 버튼이 보여야 한다');
      expect(Math.abs(restored.width - idle.width)).toBeLessThan(2);
      expect(Math.abs(restored.y - idle.y)).toBeLessThan(2);
    }).toPass();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/explore-compose-${testInfo.project.name}-scroll-idle.png`,
      scale: 'css',
    });
    if (isMobile) await button.tap();
    if (!isMobile) await button.click();
    const sheet = page.getByRole('dialog', { name: '글쓰기', exact: true });
    await expect(sheet.getByRole('button', { name: '그룹 만들기', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
    await expect(sheet).toBeInViewport({ ratio: 1 });
    await expect.poll(() => sheet.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await page.screenshot({
      path: `.data/screens/explore-compose-${testInfo.project.name}-sheet.png`,
      scale: 'css',
    });
    await sheet.getByRole('button', { name: '게시글 작성', exact: true }).click();
    const groups = page.getByRole('dialog', { name: '게시글을 올릴 그룹', exact: true });
    await expect(groups.getByRole('button', { name: `${prefix} 첫 그룹`, exact: true })).toBeVisible();
    await expect(groups.getByRole('button', { name: `${prefix} 비공개 그룹`, exact: true })).toBeVisible();
    await expect(groups.getByRole('button', { name: `${prefix} 외부 그룹 1`, exact: true })).toHaveCount(0);
    await expect(groups.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
    await groups.getByRole('button', { name: `${prefix} 비공개 그룹`, exact: true }).click();
    await expect(page).toHaveURL(`/groups/${second.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  },
);
