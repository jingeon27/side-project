import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';

[
  {
    locale: 'ko',
    register: '계정 등록',
    tag: '플레이어 태그',
    lookup: '조회',
    save: '내 계정에 등록',
    hint: '# 뒤에 영문과 숫자 8자리를 입력해주세요.',
    error: '# 뒤에 영문과 숫자로 된 8자리 태그를 입력해주세요.',
  },
  {
    locale: 'en',
    register: 'Register account',
    tag: 'Player tag',
    lookup: 'Look up',
    save: 'Register to my account',
    hint: 'Enter 8 letters or numbers after #.',
    error: 'Your tag must contain 8 letters or numbers after #.',
  },
  {
    locale: 'ja',
    register: 'アカウントを登録',
    tag: 'プレイヤータグ',
    lookup: '検索',
    save: '自分のアカウントに登録',
    hint: '# の後に半角英数字8文字を入力してください。',
    error: 'タグは # の後に半角英数字8文字で入力してください。',
  },
].forEach(({ locale, register, tag, lookup, save, hint, error }) => {
  test(`${locale} game account form validates eight alphanumeric characters and normalizes the tag`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    const login = await page.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname: `태그형식_${locale}_${Date.now().toString(36)}` },
    });
    expect(login.ok()).toBe(true);
    await page.goto(`/${locale}/settings`);
    await page.getByRole('button', { name: register, exact: true }).click();
    const sheet = page.getByRole('dialog');
    const input = sheet.getByRole('textbox', { name: tag, exact: true });
    await expect(sheet.getByText(hint, { exact: true })).toBeVisible();
    await expect(input).toHaveAttribute('maxlength', '9');
    await input.fill('#AB12CD3');
    await sheet.getByRole('button', { name: lookup, exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(error);
    await input.fill('AB12_CD4');
    await sheet.getByRole('button', { name: lookup, exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(error);
    await expect(sheet.locator('.profile-preview')).toHaveCount(0);
    await input.fill('ab12cd34');
    await sheet.getByRole('button', { name: lookup, exact: true }).click();
    await expect(sheet.locator('.profile-preview')).toContainText('#AB12CD34');
    await sheet.getByRole('button', { name: save, exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.settings-profile:visible')).toContainText('#AB12CD34');
    const session = await (await page.request.get('/api/session')).json();
    expect(session.user.supercellTag).toBe('#AB12CD34');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
