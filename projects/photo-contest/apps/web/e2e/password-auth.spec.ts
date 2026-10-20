import { expect, test } from './support/test';

test(
  '직접 가입한 아이디로 로그인하고 로그아웃 후 다시 로그인할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page }, testInfo) => {
    const loginId = `user_${testInfo.project.name.replaceAll('-', '_')}`;
    const password = '기억하기 쉬운 나만의 비밀번호 2026!';
    await page.goto('/?next=%2Fme');
    await page.getByRole('tab', { name: '회원가입', exact: true }).click();
    const registration = page.getByRole('tabpanel', { name: '회원가입', exact: true });
    await registration.getByLabel('아이디', { exact: true }).fill(loginId);
    await registration.getByLabel('닉네임', { exact: true }).fill('직접 가입 회원');
    await registration.getByLabel('비밀번호', { exact: true }).fill('short');
    await registration.getByRole('button', { name: '가입하고 시작하기' }).click();
    await expect(registration.getByText('비밀번호는 15자 이상 입력해 주세요.')).toBeVisible();
    await registration.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '가입하고 시작하기' }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: '직접 가입 회원' })).toBeVisible();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    const login = page.getByRole('tabpanel', { name: '로그인', exact: true });
    await login.getByLabel('아이디', { exact: true }).fill(loginId.toUpperCase());
    await login.getByLabel('비밀번호', { exact: true }).fill('wrong password');
    await page.getByRole('button', { name: '아이디로 로그인' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '아이디 또는 비밀번호를 확인해 주세요.' }),
    ).toBeVisible();
    await login.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '아이디로 로그인' }).click();
    await expect(page.getByRole('tabpanel', { name: '로그인', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '공개 그룹의 최신 사진' })).toBeVisible();
    await page.getByRole('link', { name: 'MY', exact: true }).click();
    await expect(page.getByRole('heading', { name: '직접 가입 회원' })).toBeVisible();
  },
);
