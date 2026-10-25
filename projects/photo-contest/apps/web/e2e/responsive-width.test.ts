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
