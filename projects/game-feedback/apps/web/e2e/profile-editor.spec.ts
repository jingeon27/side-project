import { expect, test } from '@playwright/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';
// 브라우저가 실제 디코딩하므로 청크 CRC까지 올바른 1×1 PNG여야 한다.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
for (const width of [390, 1440]) {
  test(`프로필 수정 페이지에서 닉네임·소개·링크·사진을 관리한다 (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname: `프로필_${width}_${Date.now().toString(36)}` },
    });
    expect(login.ok()).toBe(true);
    const userId = (await login.json()).user.id as string;
    await page.goto(`/ko/users/${userId}`);
    await page.getByRole('link', { name: '프로필 수정', exact: true }).click();
    const details = page.getByRole('form', { name: '프로필 수정', exact: true });
    const nickname = `새프로필_${width}`;
    await details.getByRole('textbox', { name: '서비스 닉네임', exact: true }).fill(nickname);
    await details
      .getByRole('textbox', { name: '자기소개', exact: true })
      .fill('함께 플레이해요.\nhttps://example.com/player');
    await page.route('**/api/profile', (route) =>
      route.fulfill({
        status: 503,
        json: { errorCode: 'PROFILE_UNAVAILABLE', message: '프로필 저장 재시도' },
      }),
    );
    await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
    await expect(details.getByRole('alert')).toHaveText('프로필 저장 재시도');
    await expect(details.getByRole('textbox', { name: '서비스 닉네임', exact: true })).toHaveValue(nickname);
    await page.unroute('**/api/profile');
    await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
    await expect(page).toHaveURL(`/ko/users/${userId}`);
    await expect(page.getByRole('heading', { name: nickname, exact: true })).toBeVisible();
    const bioLink = page.getByRole('link', { name: 'https://example.com/player', exact: true });
    await expect(bioLink).toHaveAttribute('href', 'https://example.com/player');
    await expect(bioLink).toHaveAttribute('target', '_blank');
    await expect(page).toHaveTitle(new RegExp(nickname));
    await page.screenshot({ path: testInfo.outputPath('profile-bio.png'), fullPage: true });
    await page.getByRole('link', { name: '프로필 수정', exact: true }).click();
    await expect(page).toHaveURL('/ko/settings/profile');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('banner').getByRole('link', { name: '돌아가기', exact: true }).click();
    await expect(page).toHaveURL(`/ko/users/${userId}`);
    await page.getByRole('link', { name: '프로필 수정', exact: true }).click();
    await details.getByRole('textbox', { name: '서비스 닉네임', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('profile-edit-page.png'), fullPage: true });
    const links = page.getByRole('form', { name: '프로필 링크 편집' });
    await links.getByRole('button', { name: '링크 추가' }).click();
    await links.getByRole('textbox', { name: /이름/ }).fill('나의 방송');
    await links.getByRole('textbox', { name: /주소/ }).fill('https://video.example/@player');
    await links.getByRole('button', { name: '링크 저장' }).click();
    await expect
      .poll(async () => (await (await page.request.get(`/api/users/${userId}`)).json()).links)
      .toEqual([{ label: '나의 방송', url: 'https://video.example/@player' }]);
    const photo = page.getByRole('form', { name: '프로필 사진 편집' });
    await photo
      .getByLabel('프로필 사진 선택', { exact: true })
      .setInputFiles({ name: 'profile.png', mimeType: 'image/png', buffer: png });
    const preview = photo.getByRole('img', { name: '선택한 프로필 사진 미리보기' });
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const uploadResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/profile/avatar/uploads/') && response.url().endsWith('/complete'),
    );
    await photo.getByRole('button', { name: '사진 저장', exact: true }).click();
    expect((await uploadResponse).ok()).toBe(true);
    await expect(preview).toBeHidden();
    await expect(page.locator('.profile-editor-identity img')).toHaveCount(1);
    await page.reload();
    await expect(details.getByRole('textbox', { name: '서비스 닉네임', exact: true })).toHaveValue(nickname);
    await expect(links.getByRole('textbox', { name: /이름/ })).toHaveValue('나의 방송');
    await photo.getByRole('button', { name: '프로필 사진 삭제' }).click();
    await expect(page.locator('.profile-editor-identity img')).toHaveCount(0);
    await links.getByRole('button', { name: '링크 삭제' }).click();
    await links.getByRole('button', { name: '링크 저장' }).click();
    await page.goto(`/ko/users/${userId}`);
    await expect(page.getByRole('link', { name: '나의 방송', exact: true })).toHaveCount(0);
    await expect(page.locator('main > .back-link')).toHaveCount(0);
    await page.goto('/ko/settings');
    await page.getByRole('link', { name: '공개 프로필 보기 →', exact: true }).click();
    await expect(page.getByRole('banner').getByText('프로필', { exact: true })).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: '돌아가기', exact: true }).click();
    await expect(page).toHaveURL('/ko/settings');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const other = await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-3' },
    });
    expect(other.ok()).toBe(true);
    await page.goto(`/ko/users/${userId}`);
    await expect(page.getByRole('link', { name: '프로필 수정', exact: true })).toHaveCount(0);
  });
}

test('게임 계정의 이전 스냅샷도 최신 순위와 RoyaleAPI 링크를 보여주며 갱신은 대표 계정을 바꾸지 않는다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post('/api/auth/demo', {
    headers: { Origin: origin },
    data: { nickname: `게임카드_${Date.now().toString(36)}` },
  });
  for (const playerTag of ['#P0LYQ829', '#9QY82JGY']) {
    expect(
      (
        await page.request.post('/api/me/game-accounts', { headers: { Origin: origin }, data: { playerTag } })
      ).ok(),
    ).toBe(true);
  }
  await page.route('**/api/me/game-accounts', async (route) => {
    const response = await route.fetch();
    const records = await response.json();
    await route.fulfill({
      response,
      json: records.map(
        ({ currentGlobalRank: _current, bestGlobalRank: _best, ...profile }: Record<string, unknown>) =>
          profile,
      ),
    });
  });
  await page.goto('/ko/settings');
  const accounts = page.getByRole('region', { name: '게임 계정', exact: true });
  await expect(accounts.getByText('1,234위')).toHaveCount(2);
  await expect(accounts.getByText('358위')).toHaveCount(2);
  const link = accounts.getByRole('link', { name: '새벽의호그의 RoyaleAPI 프로필 (새 탭)', exact: true });
  await expect(link).toHaveAttribute('href', 'https://royaleapi.com/player/P0LYQ829');
  await accounts.getByRole('button', { name: '새벽의호그 게임 정보 새로고침', exact: true }).click();
  const session = await (await page.request.get('/api/session')).json();
  expect(session.user.supercellTag).toBe('#9QY82JGY');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await accounts.screenshot({ path: testInfo.outputPath(`game-accounts-${width}.png`) });
  }
});

test('공개 프로필은 비로그인 방문자에게 등록한 게임 계정 전체를 보여준다', async ({
  page,
  browser,
}, testInfo) => {
  const login = await page.request.post('/api/auth/demo', {
    headers: { Origin: origin },
    data: { nickname: `공개계정_${Date.now().toString(36)}` },
  });
  const { user } = await login.json();
  for (const playerTag of ['#P0LYQ829', '#9QY82JGY']) {
    expect(
      (
        await page.request.post('/api/me/game-accounts', { headers: { Origin: origin }, data: { playerTag } })
      ).ok(),
    ).toBe(true);
  }
  const visitor = await browser.newContext({ baseURL: origin });
  try {
    const publicProfile = await visitor.request.get(`/api/users/${user.id}`);
    expect(publicProfile.ok()).toBe(true);
    expect(
      (await publicProfile.json()).gameAccounts.map((account: { playerTag: string }) => account.playerTag),
    ).toEqual(['#9QY82JGY', '#P0LYQ829']);
    const view = await visitor.newPage();
    await view.setViewportSize({ width: 390, height: 844 });
    await view.goto(`/ko/users/${user.id}`);
    const accounts = view.getByRole('region', { name: '게임 계정', exact: true });
    await expect(accounts.getByText('#P0LYQ829', { exact: true })).toBeVisible();
    await expect(accounts.getByText('#9QY82JGY', { exact: true })).toBeVisible();
    await expect(view.getByRole('link', { name: '프로필 수정', exact: true })).toHaveCount(0);
    expect(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await view.screenshot({ path: testInfo.outputPath('public-game-accounts.png'), fullPage: true });
  } finally {
    await visitor.close();
  }
});
