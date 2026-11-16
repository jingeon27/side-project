import { mkdir } from 'node:fs/promises';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { expect, seedGroup, test } from './support/test';

test(
  '긴 그룹 이름도 태블릿과 데스크톱 전환 시 카드와 화면을 벗어나지 않아야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('화면 너비 확인 회원');
    const owner = await createTestUser(API_URL, { nickname: '긴 이름 그룹장', origin: WEB_ORIGIN });
    const name = 'W'.repeat(40 - testInfo.project.name.length) + testInfo.project.name;
    await seedGroup(owner, name);
    for (const path of ['/', '/explore']) {
      await page.goto(path);
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      for (const width of [360, 430, 768, 1023, 1024, 1100, 1279, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        const bounds = await link.evaluate((element) => {
          const card = element.closest('article');
          if (!card) throw new Error('그룹 카드가 있어야 한다');
          return { link: element.getBoundingClientRect().right, card: card.getBoundingClientRect().right };
        });
        expect(bounds.link).toBeLessThanOrEqual(bounds.card);
        if (width === 1024 || width === 1440) {
          await mkdir('.data/screens', { recursive: true });
          await page.screenshot({
            path: `.data/screens/${testInfo.project.name}-${path === '/' ? 'home' : 'explore'}-${width}.png`,
            fullPage: false,
            scale: 'css',
          });
        }
      }
    }
  },
);

test(
  '데스크톱 셸은 화면을 채우고 홈 목록은 제목과 같은 읽기 폭으로 정렬해야 한다',
  { tag: ['@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('전체 화면 사용자');
    const owner = await createTestUser(API_URL, { nickname: '넓은 화면 그룹장', origin: WEB_ORIGIN });
    const group = await seedGroup(owner, '전체 화면 공개 그룹', 'PUBLIC');
    for (const path of ['/', '/explore', '/me', '/notifications', `/groups/${group.id}`]) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: '주요 메뉴', exact: true })).toBeVisible();
      if (path === `/groups/${group.id}`)
        await expect(page.getByRole('heading', { name: '전체 화면 공개 그룹', exact: true })).toBeVisible();
      for (const width of [1024, 1440, 1920, 2560]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(page.locator('[data-desktop-nav]')).toBeVisible();
        await expect(page.locator('#pc-main header:visible').first()).toBeVisible();
        // 그룹 조회가 끝나면 Suspense의 임시 헤더가 교체되므로 측정과 단언을 함께 다시 시도한다.
        await expect(async () => {
          const main = await page.locator('#pc-main').boundingBox();
          const sidebar = await page.locator('[data-desktop-nav]').boundingBox();
          const header = await page.locator('#pc-main header:visible').first().boundingBox();
          if (!main || !sidebar || !header) throw new Error('셸과 메뉴, 헤더가 보여야 한다');
          expect(main.x).toBe(0);
          expect(main.width).toBe(width);
          expect(main.height).toBeGreaterThanOrEqual(1000);
          expect(sidebar.x).toBe(0);
          expect(header.x).toBe(sidebar.width);
          expect(header.x + header.width).toBe(width);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (['/', '/explore', '/me'].includes(path)) {
            const regionName =
              path === '/' ? '공개 그룹 목록' : path === '/explore' ? '탐색할 그룹' : '참여 그룹';
            const list = page.getByRole('region', { name: regionName, exact: true });
            await expect(list).toBeVisible();
            const region = await list.boundingBox();
            if (!region) throw new Error('목록 영역이 보여야 한다');
            if (path === '/') {
              const title = page.getByRole('heading', { name: '우리끼리 모은 순간.', exact: true });
              const contentHeader = await title.locator('xpath=ancestor::header').boundingBox();
              if (!contentHeader) throw new Error('홈 본문 제목이 보여야 한다');
              expect(region.x).toBe(contentHeader.x);
              expect(region.width).toBe(contentHeader.width);
              expect(region.width).toBe(Math.min(1152, width - sidebar.width - 64));
              expect(region.x - sidebar.width).toBe(width - region.x - region.width);
              return;
            }
            expect(region.x + region.width).toBe(width - 32);
          }
        }).toPass({ timeout: 15_000 });
        if (width === 1920 && path === '/me')
          await page.screenshot({ path: testInfo.outputPath('desktop-full-width-my.png'), fullPage: false });
      }
    }
  },
);
