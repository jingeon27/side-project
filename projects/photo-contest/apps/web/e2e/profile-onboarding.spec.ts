import { createTestImage, createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { expect, test } from './support/test';

test(
  '소셜 이름·사진을 가입 기본값으로 보여 주고 사진 제거·닉네임 수정·약관 동의 후 가입해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context }, testInfo) => {
    const avatar = 'https://provider.example/profile.png';
    const image = await createTestImage();
    await page.route(avatar, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: image }),
    );
    const cookie = await createTestUser(API_URL, {
      nickname: '소셜 기본 이름',
      origin: WEB_ORIGIN,
      needsOnboarding: true,
      avatar,
    });
    await context.addCookies([
      {
        name: 'contest_session',
        value: cookie.slice('contest_session='.length),
        url: WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/onboarding?next=%2Fme');
    await expect(page.getByLabel('닉네임', { exact: true })).toHaveValue('소셜 기본 이름');
    await expect(page.getByAltText('프로필 사진 미리보기')).toHaveAttribute('src', avatar);
    await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '이용약관과 개인정보 처리방침' })).toContainText(
      '동의해 주세요',
    );
    await page.getByRole('button', { name: '사진 삭제', exact: true }).click();
    await expect(page.getByAltText('프로필 사진 미리보기')).toHaveCount(0);
    await page.getByLabel('닉네임', { exact: true }).fill('내가 정한 이름');
    await page.getByRole('checkbox').check();
    await page.screenshot({ path: testInfo.outputPath('onboarding-mobile.png') });
    await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: '내가 정한 이름', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);

test(
  '프로필 사진을 S3에 직접 올려 변경하고 삭제할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    await signIn('프로필사진회원');
    await page.goto('/me');
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '프로필 수정', exact: true });
    await sheet
      .getByLabel('프로필 사진 선택')
      .setInputFiles({ name: 'profile.png', mimeType: 'image/png', buffer: await createTestImage() });
    await sheet.getByLabel('닉네임', { exact: true }).fill('프로필수정완료');
    await sheet.getByRole('button', { name: '프로필 저장하기' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '프로필수정완료', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    await expect(sheet.getByAltText('프로필 사진 미리보기')).toHaveAttribute('src', /\/backend\/profiles\//);
    await sheet.getByRole('button', { name: '사진 삭제', exact: true }).click();
    await sheet.getByRole('button', { name: '프로필 저장하기' }).click();
    await expect(sheet).toHaveCount(0);
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    await expect(sheet.getByAltText('프로필 사진 미리보기')).toHaveCount(0);
  },
);
