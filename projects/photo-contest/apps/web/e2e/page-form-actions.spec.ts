import { expect, seedGroup, test } from './support/test';

test(
  '작성·수정 폼은 본문 길이와 화면 높이에 관계없이 주 행동을 하단에 유지해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn('하단 고정 폼 확인');
    const group = await seedGroup(owner, '폼 배치 확인 그룹', 'PUBLIC');
    for (const path of ['/groups/new', `/groups/${group.id}/edit`, `/groups/${group.id}/write`]) {
      await page.goto(path);
      await expect(page.getByRole('contentinfo')).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: '서비스 정책', exact: true })).toHaveCount(0);
      const footer = page.locator('[data-sticky-cta]');
      const scroll = page.locator('[data-form-scroll]');
      await expect(
        footer.getByRole('button', { name: /그룹 만들기|프로필 저장하기|게시물 올리기/ }),
      ).toBeEnabled();
      if (path !== `/groups/${group.id}/write`) await page.locator('summary').click();
      for (const height of [844, 420, 900]) {
        await page.setViewportSize({
          width: testInfo.project.name === 'desktop-chrome' ? 1440 : 390,
          height,
        });
        await expect(async () => {
          const bounds = await footer.boundingBox();
          const fields = await scroll.boundingBox();
          expect(bounds).not.toBeNull();
          expect(fields).not.toBeNull();
          expect(Math.abs((bounds?.y ?? 0) + (bounds?.height ?? 0) - height)).toBeLessThanOrEqual(1);
          expect((fields?.y ?? 0) + (fields?.height ?? 0)).toBeLessThanOrEqual((bounds?.y ?? 0) + 1);
        }).toPass();
        await expect(footer).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (path.endsWith('/edit'))
        await page.screenshot({ path: testInfo.outputPath('group-edit-bottom.png'), animations: 'disabled' });
      await page.evaluate(() => {
        const viewport = window.visualViewport;
        if (!viewport) throw new Error('visualViewport is required');
        Object.defineProperties(viewport, {
          height: { configurable: true, value: 420 },
          offsetTop: { configurable: true, value: 24 },
        });
        viewport.dispatchEvent(new Event('resize'));
      });
      await expect(async () => {
        const bounds = await footer.boundingBox();
        expect(Math.abs((bounds?.y ?? 0) + (bounds?.height ?? 0) - 444)).toBeLessThanOrEqual(1);
      }).toPass();
      await page.evaluate(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        Reflect.deleteProperty(viewport, 'height');
        Reflect.deleteProperty(viewport, 'offsetTop');
        viewport.dispatchEvent(new Event('resize'));
      });
    }
  },
);
