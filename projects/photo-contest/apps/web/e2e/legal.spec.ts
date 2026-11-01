import { mkdir } from 'node:fs/promises';

import { WEB_ORIGIN } from './support/env';
import { expect, test } from './support/test';

test(
  '약관·개인정보는 로그인 없이 읽고 문의할 수 있으며 로그인·MY에서 연결돼야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, signIn }, testInfo) => {
    await page.goto('/');
    await page.getByRole('link', { name: '이용약관', exact: true }).first().click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/terms`);
    await expect(page.getByRole('heading', { name: '이용약관', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle('이용약관 - 피식');
    await expect(page.getByRole('link', { name: 'contact@bambyul.com', exact: true })).toHaveAttribute(
      'href',
      'mailto:contact@bambyul.com',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('link', { name: '개인정보 처리방침', exact: true }).first().click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/privacy`);
    await expect(page.getByRole('heading', { name: '개인정보 처리방침', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle('개인정보 처리방침 - 피식');
    expect((await context.cookies()).some((cookie) => cookie.name === 'contest_session')).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const response = await page.request.get('/privacy');
    expect(response.status()).toBe(200);
    expect(
      await page.evaluate(
        (html) =>
          new DOMParser()
            .parseFromString(html, 'text/html')
            .querySelector('article')
            ?.textContent?.includes('비밀번호 원문은 저장하지 않습니다.'),
        await response.text(),
      ),
    ).toBe(true);

    const icon = page.locator('link[rel="icon"][type="image/svg+xml"]').first();
    await expect(icon).toHaveAttribute('href', /\/icon\.svg/);
    const iconUrl = await icon.getAttribute('href');
    if (!iconUrl) throw new Error('favicon 주소가 있어야 한다');
    const iconResponse = await page.request.get(iconUrl);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()['content-type']).toContain('image/svg+xml');
    expect(await iconResponse.text()).toContain('<svg');
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-privacy.png` });

    await signIn('정책 확인 회원');
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: '서비스 안내', exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: '서비스 정책' })
      .last()
      .getByRole('link', { name: '개인정보 처리방침', exact: true })
      .click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/privacy`);
    await expect(page.getByRole('heading', { name: '개인정보 처리방침', level: 1 })).toBeVisible();
  },
);
