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
    await form.locator('summary').click();
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

test(
  '그룹 생성은 필수 입력부터 시작하고 사진을 접어도 선택을 보존해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    await signIn('그룹 입력 순서 확인');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/groups/new');
    const form = page.getByRole('form', { name: '그룹 만들기' });
    const name = form.getByRole('textbox', { name: '그룹 이름', exact: true });
    const visibility = form.getByRole('group', { name: '공개 범위' });
    const summary = form.locator('summary');
    await expect(name).toBeInViewport({ ratio: 1 });
    const nameBounds = await name.boundingBox();
    const visibilityBounds = await visibility.boundingBox();
    expect(nameBounds?.y).toBeLessThan(200);
    expect(visibilityBounds?.y).toBeGreaterThan((nameBounds?.y ?? 0) + (nameBounds?.height ?? 0));
    await expect(form.locator('details')).not.toHaveAttribute('open');
    await summary.click();
    const image = await createTestImage({ width: 60, height: 30 });
    await form
      .getByLabel('그룹 배경 사진 선택')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image });
    const preview = form.getByRole('img', { name: '그룹 배경 사진 미리보기' });
    await expect(preview).toBeVisible();
    const source = await preview.getAttribute('src');
    await summary.click();
    await name.fill('사진 선택 유지');
    await summary.click();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('src', source ?? '');
    await expect(name).toHaveValue('사진 선택 유지');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.getByRole('button', { name: '그룹 배경 사진 삭제' }).click();
    await summary.click();
    await form.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/(?!new$)[^/]+$/);
    await expect(page.getByRole('heading', { name: '사진 선택 유지', exact: true })).toBeVisible();
  },
);
