import { expect, test } from './support/test';

[
  {
    locale: 'ko',
    register: '계정 등록',
    tag: '플레이어 태그',
    lookup: '조회',
    save: '내 계정에 등록',
    hint: '게임 프로필에 표시된 #과 영문·숫자 태그를 입력해주세요.',
    error: '# 뒤에 영문과 숫자로 된 플레이어 태그를 입력해주세요.',
  },
  {
    locale: 'en',
    register: 'Register account',
    tag: 'Player tag',
    lookup: 'Look up',
    save: 'Register to my account',
    hint: 'Enter the # and player tag shown on your game profile.',
    error: 'Enter a player tag containing letters or numbers after #.',
  },
  {
    locale: 'ja',
    register: 'アカウントを登録',
    tag: 'プレイヤータグ',
    lookup: '検索',
    save: '自分のアカウントに登録',
    hint: 'ゲームプロフィールに表示されている # と英数字のタグを入力してください。',
    error: '# の後に半角英数字のプレイヤータグを入力してください。',
  },
].forEach(({ locale, register, tag, lookup, save, hint, error }) => {
  test(`${locale} game account form preserves nine-character tags and validates their format`, async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
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
    await expect(input).toHaveAttribute('maxlength', '16');
    await input.fill('#');
    await sheet.getByRole('button', { name: lookup, exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(error);
    await input.fill('AB12_CD4');
    await sheet.getByRole('button', { name: lookup, exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(error);
    await expect(sheet.locator('.profile-preview')).toHaveCount(0);
    await input.fill('#p0lyq829g');
    await sheet.getByRole('button', { name: lookup, exact: true }).click();
    await expect(sheet.locator('.profile-preview')).toContainText('#P0LYQ829G');
    await sheet.getByRole('button', { name: save, exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.settings-profile:visible')).toContainText('#P0LYQ829G');
    const session = await (await page.request.get('/api/session')).json();
    expect(session.user.supercellTag).toBe('#P0LYQ829G');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
