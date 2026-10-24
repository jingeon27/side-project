import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { createTestImage, createTestVideo } from '@photo-contest/test-kit';

test('운영 이미지에서 가입·저장소 직접 전송 사진/영상·댓글과 재시작 뒤 데이터가 유지돼야 한다', async ({
  page,
  request,
}) => {
  const origin = new URL(process.env.DEPLOY_SMOKE_ORIGIN ?? 'https://localhost:3382').origin;
  // 미디어는 서버 volume이 아니라 S3 호환 버킷(검증에서는 test-kit 대역)으로 브라우저가 직접 오간다.
  const storage = new URL(process.env.DEPLOY_SMOKE_STORAGE ?? 'http://storage.localhost:3383').origin;
  await page.route('**/*', (route) =>
    [origin, storage].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort(),
  );
  /** 고정 경로는 권한만 확인하고 캐시 금지 307로 짧은 서명 GET에 보낸다. */
  const expectStorageRedirect = async (response: { status(): number; headers(): Record<string, string> }) => {
    expect(response.status()).toBe(307);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const signed = new URL(response.headers()['location'] ?? '');
    expect(signed.origin).toBe(storage);
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('60');
    return signed.toString();
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const home = await page.goto('/');
  // 운영 이미지가 프레임워크를 알리지 않고, CSP를 지킨 채 http 저장소 대역으로 업로드·조회까지 이어지는지 본다.
  expect(home?.headers()['x-powered-by']).toBeUndefined();
  expect(home?.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
  await expect(page.getByRole('link', { name: /구글|카카오/ })).toHaveCount(0);
  await page.getByRole('tab', { name: '회원가입', exact: true }).click();
  await page.getByLabel('아이디', { exact: true }).fill('container_owner');
  await page.getByLabel('닉네임', { exact: true }).fill('배포 검증 회원');
  await page.getByLabel('비밀번호', { exact: true }).fill('container password for smoke 2026');
  await page.getByRole('button', { name: '가입하고 시작하기', exact: true }).click();
  await expect(page.getByRole('tab', { name: '회원가입', exact: true })).toHaveCount(0);
  expect(await page.context().cookies()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: '__Host-contest_session',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      }),
    ]),
  );
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '배포 검증 회원', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
  const groupForm = page.getByRole('dialog');
  await groupForm.getByLabel('그룹 이름').fill('운영 이미지 그룹');
  await groupForm.getByRole('button', { name: '그룹 만들기', exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);

  const groupPath = new URL(page.url()).pathname;
  const createMediaPost = async (title: string, video = false) => {
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const form = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
    await form.getByLabel('제목', { exact: true }).fill(title);
    await form.getByLabel('사진·동영상 선택', { exact: true }).setInputFiles({
      name: video ? 'smoke.mp4' : 'smoke.png',
      mimeType: video ? 'video/mp4' : 'image/png',
      buffer: video ? await createTestVideo() : await createTestImage(),
    });
    await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
    await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(form).toHaveCount(0);
  };
  await createMediaPost('운영 사진');
  await createMediaPost('운영 동영상', true);
  const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
  const photo = latest.getByRole('article', { name: '운영 사진', exact: true });
  const photoImage = photo.getByRole('img', { name: '운영 사진', exact: true });
  const mediaUrl = await photoImage.getAttribute('src');
  if (!mediaUrl) throw new Error('사진 주소가 있어야 한다');
  await expectStorageRedirect(await page.request.get(mediaUrl, { maxRedirects: 0 }));
  await expectStorageRedirect(await request.get(mediaUrl, { maxRedirects: 0 }));
  await expect
    .poll(() => photoImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const videoUrl = await latest
    .getByRole('article', { name: '운영 동영상', exact: true })
    .locator('video')
    .getAttribute('src');
  if (!videoUrl) throw new Error('영상 주소가 있어야 한다');
  const signedVideo = await expectStorageRedirect(await page.request.get(videoUrl, { maxRedirects: 0 }));
  // 브라우저처럼 서명 GET에 Range를 보내 저장소가 구간을 돌려주는지 확인한다.
  const range = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=0-31' } });
    return { status: response.status, length: (await response.arrayBuffer()).byteLength };
  }, signedVideo);
  expect(range).toEqual({ status: 206, length: 32 });
  const authConfig = await request.get('/backend/auth/config');
  expect(authConfig.status()).toBe(200);
  expect(await authConfig.json()).toEqual({ developmentLogin: false, google: false, kakao: false });
  const testing = await request.post('/backend/testing/users', {
    headers: { Origin: process.env.DEPLOY_SMOKE_ORIGIN ?? '' },
    data: { nickname: '운영에서 만들면 안 되는 계정' },
  });
  expect(testing.status()).toBe(404);
  await photo.getByRole('button', { name: '운영 사진 댓글 0개', exact: true }).click();
  const comments = page.getByRole('dialog', { name: '댓글', exact: true });
  await comments.getByRole('textbox', { name: '댓글', exact: true }).fill('재시작해도 남는 댓글');
  await comments.getByRole('button', { name: '댓글 올리기', exact: true }).click();
  await expect(comments.getByText('재시작해도 남는 댓글', { exact: true })).toBeVisible();
  await comments.getByRole('button', { name: '닫기', exact: true }).click();

  const seoResponse = await request.get(`${groupPath}?utm_source=container`, {
    headers: { 'User-Agent': 'Twitterbot' },
  });
  expect(seoResponse.status()).toBe(200);
  const seoHtml = await seoResponse.text();
  expect(seoHtml).toContain(`rel="canonical" href="${process.env.DEPLOY_SMOKE_ORIGIN}${groupPath}"`);
  expect(seoHtml).toContain('application/ld+json');
  expect(seoHtml).toContain('DiscussionForumPosting');

  await page.goto('/explore');
  await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
  const privateForm = page.getByRole('dialog', { name: '그룹 만들기', exact: true });
  await privateForm.getByLabel('그룹 이름').fill('운영 비공개 그룹');
  await privateForm.getByRole('radio', { name: /^비공개 그룹/ }).check();
  await privateForm.getByRole('button', { name: '그룹 만들기', exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);
  const privatePath = new URL(page.url()).pathname;
  await createMediaPost('운영 비공개 사진');
  const privateUrl = await page
    .getByRole('region', { name: '최신 게시물', exact: true })
    .getByRole('article', { name: '운영 비공개 사진', exact: true })
    .getByRole('img', { name: '운영 비공개 사진', exact: true })
    .getAttribute('src');
  if (!privateUrl) throw new Error('비공개 사진 주소가 있어야 한다');
  await expectStorageRedirect(await page.request.get(privateUrl, { maxRedirects: 0 }));
  expect((await request.get(privateUrl, { maxRedirects: 0 })).status()).toBe(404);
  const privateHtml = await (
    await request.get(privatePath, { headers: { 'User-Agent': 'Twitterbot' } })
  ).text();
  expect(privateHtml).toContain('noindex');
  expect(privateHtml).not.toContain('운영 비공개 사진');
  expect(privateHtml).not.toContain('application/ld+json');
  await page.goto(groupPath);

  const directory = process.env.SMOKE_COMPOSE_DIR;
  const project = process.env.SMOKE_COMPOSE_PROJECT;
  if (!directory || !project?.startsWith('pc-smoke-')) throw new Error('격리 Compose 정보가 필요합니다.');
  const files = ['-f', `${directory}/compose.yaml`];
  if (process.env.SMOKE_COMPOSE_OVERRIDE) files.push('-f', process.env.SMOKE_COMPOSE_OVERRIDE);
  await promisify(execFile)('docker', [
    'compose',
    '--project-name',
    project,
    '--env-file',
    `${directory}/.env`,
    ...files,
    'restart',
    'api',
    'web',
  ]);
  await promisify(execFile)('docker', [
    'compose',
    '--project-name',
    project,
    '--env-file',
    `${directory}/.env`,
    ...files,
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    '120',
    'api',
    'web',
  ]);
  // API 헬스만으로는 웹의 복구와 Docker 재시작 중 끊긴 브라우저 연결까지 확인할 수 없다.
  await expect(async () => {
    expect((await request.get('/backend/health')).status()).toBe(200);
    const response = await page.goto(groupPath, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(photo.getByRole('button', { name: '운영 사진 댓글 1개', exact: true })).toBeVisible();
  }).toPass({ timeout: 45_000, intervals: [1_000, 2_000, 5_000] });
  await expectStorageRedirect(await page.request.get(mediaUrl, { maxRedirects: 0 }));
  await expect
    .poll(() => photoImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '배포 검증 회원', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: '참여 그룹', exact: true })
      .getByRole('link', { name: /운영 이미지 그룹/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('운영 Caddy가 앱 링크 검증 파일과 앱 로그인 콜백 안내를 막지 않고 그대로 전달해야 한다', async ({
  request,
}) => {
  // containers.sh의 .env 값이다. 실제 앱과 연결되지 않는 검증용 식별자다.
  const appId = 'SMOKETEAM0.test.smoke.photocontest';
  const aasa = await request.get('/.well-known/apple-app-site-association', { maxRedirects: 0 });
  expect(aasa.status()).toBe(200);
  expect(aasa.headers()['content-type']).toContain('application/json');
  expect(await aasa.json()).toEqual({
    applinks: { details: [{ appIDs: [appId], components: [{ '/': '/app-auth/callback' }] }] },
    webcredentials: { apps: [appId] },
  });
  const assetLinks = await request.get('/.well-known/assetlinks.json', { maxRedirects: 0 });
  expect(assetLinks.status()).toBe(200);
  expect(await assetLinks.json()).toEqual([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'test.smoke.photocontest',
        sha256_cert_fingerprints: [Array.from({ length: 32 }, () => '5A').join(':')],
      },
    },
  ]);
  const callback = await request.get('/app-auth/callback?code=smoke-login-code-0123456789', {
    maxRedirects: 0,
  });
  expect(callback.status()).toBe(200);
  expect(callback.headers()['cache-control']).toBe('no-store');
  expect(callback.headers()['referrer-policy']).toContain('no-referrer');
  expect(await callback.text()).not.toContain('smoke-login-code');
});
