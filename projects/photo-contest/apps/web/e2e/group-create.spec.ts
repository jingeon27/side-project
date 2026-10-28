import { createTestImage } from '@photo-contest/test-kit';

import { expect, test } from './support/test';

test(
  '별도 그룹 생성 페이지에서 배경·프로필 사진을 선택하고 새로고침 뒤에도 보여야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('그룹 사진 선택 회원');
    await page.goto('/me');
    await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL('/groups/new');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const form = page.getByRole('form', { name: '그룹 만들기' });
    const name = `사진이 있는 그룹-${testInfo.project.name}`;
    await form.getByRole('textbox', { name: '그룹 이름', exact: true }).fill(name);
    const image = await createTestImage({ width: 600, height: 300 });
    await form
      .getByLabel('그룹 배경 사진 선택')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image });
    await form
      .getByLabel('그룹 프로필 사진 선택')
      .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });
    await expect(form.getByRole('img', { name: '그룹 배경 사진 미리보기' })).toBeVisible();
    await expect(form.getByRole('img', { name: '그룹 프로필 사진 미리보기' })).toBeVisible();
    await form.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/(?!new$)[^/]+$/);
    const cover = page.getByRole('img', { name: `${name} 배경 사진`, exact: true });
    await expect(cover).toBeVisible();
    await expect
      .poll(() =>
        cover.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth > 0),
      )
      .toBe(true);
    const avatar = page.locator('img[src*="/avatar/"]');
    await expect(avatar).toBeVisible();
    await expect
      .poll(() =>
        avatar.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth > 0),
      )
      .toBe(true);
    await expect(page.locator('header').getByRole('link', { name: /알림/ })).toBeVisible();
    await page.reload();
    await expect(cover).toBeVisible();
    await expect(avatar).toBeVisible();
  },
);
