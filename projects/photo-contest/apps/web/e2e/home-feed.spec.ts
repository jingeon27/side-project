import { mkdir } from 'node:fs/promises';
import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '홈은 모든 내 그룹의 최신 게시물을 모으고 그룹 관리는 MY에서 해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const viewer = await signIn('홈 피드 사용자');
    const friend = await createTestUser(API_URL, { nickname: '홈 피드 친구', origin: WEB_ORIGIN });
    const first = await seedGroup(viewer, '동네 친구들');
    const second = await seedGroup(friend, '회사 친구들');
    const privateGroup = await seedGroup(friend, '가입하지 않은 비밀 그룹');
    await productRequest(viewer, 'mutation($token: String!) { joinGroup(token: $token) { id } }', {
      token: second.inviteToken,
    });
    await seedPost(viewer, first.id, '먼저 올라온 순간');
    await seedPost(viewer, first.id, '중간에 올라온 순간');
    await seedPost(friend, second.id, '가장 최근의 순간');
    await seedPost(friend, privateGroup.id, '노출되면 안 되는 순간');

    await page.goto('/');
    await expect(page.getByText('합성도 환영', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '최신 게시물' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '내 그룹', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '그룹 만들기', exact: true })).toHaveCount(0);
    const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
    await expect(latest.getByRole('article')).toHaveCount(3);
    await expect(latest.getByRole('article').getByRole('heading')).toHaveText([
      '가장 최근의 순간',
      '중간에 올라온 순간',
      '먼저 올라온 순간',
    ]);
    await expect(page.getByText('노출되면 안 되는 순간', { exact: true })).toHaveCount(0);
    await expect(page.getByText('숨긴 순간', { exact: true })).toHaveCount(0);
    const newest = latest.getByRole('article', { name: '가장 최근의 순간' });
    await newest.getByRole('button', { name: '가장 최근의 순간 좋아요' }).click();
    await expect(newest.getByRole('button', { name: '가장 최근의 순간 좋아요' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const columnCount = () =>
      page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .locator('[data-photo-feed]')
        .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    if (testInfo.project.name === 'desktop-chrome') {
      expect(await columnCount()).toBe(1);
      expect((await page.locator('#pc-main').boundingBox())?.width).toBeGreaterThan(1000);
      const feed = await latest.boundingBox();
      const popular = await page.getByRole('region', { name: '이달의 인기', exact: true }).boundingBox();
      expect(feed?.width).toBeLessThanOrEqual(540);
      if (!feed || !popular) throw new Error('피드와 인기 사진이 보여야 한다');
      expect(popular.x).toBeGreaterThan(feed.x + feed.width);
      await mkdir('.data/screens', { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: '.data/screens/desktop-photo-feed.png', fullPage: true });
      await page.setViewportSize({ width: 820, height: 1180 });
      expect(await columnCount()).toBe(1);
      expect((await latest.boundingBox())?.width).toBeLessThanOrEqual(540);
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(await columnCount()).toBe(1);
    const image = await newest.getByRole('img', { name: '가장 최근의 순간' }).boundingBox();
    expect(image?.width).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.data/screens', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-photo-feed.png`, fullPage: true });
    await page.getByRole('link', { name: 'MY', exact: true }).click();
    await expect(page.getByRole('heading', { name: '내 그룹', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /동네 친구들/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /회사 친구들/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '그룹 만들기', exact: true })).toBeVisible();
    await expect(page.getByText('가입하지 않은 비밀 그룹', { exact: true })).toHaveCount(0);
    if (testInfo.project.name === 'desktop-chrome') {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: '.data/screens/desktop-my-groups.png', fullPage: true });
    }
  },
);
