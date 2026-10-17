import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTestImage, createTestVideo } from '@photo-contest/test-kit';
import { expect, test } from '@playwright/test';

test('운영 이미지에서 가입·사진/영상·댓글과 재시작 뒤 데이터가 유지돼야 한다', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: /구글|카카오/ })).toHaveCount(0);
  await page.getByRole('tab', { name: '회원가입', exact: true }).click();
  await page.getByLabel('아이디', { exact: true }).fill('container_owner');
  await page.getByLabel('닉네임', { exact: true }).fill('배포 검증 회원');
  await page.getByLabel('비밀번호', { exact: true }).fill('container password for smoke 2026');
  await page.getByRole('button', { name: '가입하고 시작하기', exact: true }).click();
  await expect(page.getByRole('tab', { name: '회원가입', exact: true })).toHaveCount(0);
  expect(await page.context().cookies()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'contest_session', httpOnly: true, secure: true, sameSite: 'Lax' }),
    ]),
  );
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '배포 검증 회원', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
  const groupForm = page.getByRole('dialog');
  await groupForm.getByLabel('그룹 이름').fill('운영 이미지 그룹');
  await groupForm.getByRole('button', { name: '그룹 만들기', exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);

  for (const video of [false, true]) {
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const form = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
    await form.getByLabel('제목', { exact: true }).fill(video ? '운영 동영상' : '운영 사진');
    await form.getByLabel('사진·동영상 선택', { exact: true }).setInputFiles({
      name: video ? 'smoke.mp4' : 'smoke.png',
      mimeType: video ? 'video/mp4' : 'image/png',
      buffer: video ? await createTestVideo() : await createTestImage(),
    });
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
  const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
  const photo = latest.getByRole('article', { name: '운영 사진', exact: true });
  const mediaUrl = await photo.getByRole('img', { name: '운영 사진', exact: true }).getAttribute('src');
  if (!mediaUrl) throw new Error('사진 주소가 있어야 한다');
  expect((await page.request.get(mediaUrl)).status()).toBe(200);
  expect((await request.get(mediaUrl)).status()).toBe(401);
  const videoUrl = await latest
    .getByRole('article', { name: '운영 동영상', exact: true })
    .locator('video')
    .getAttribute('src');
  if (!videoUrl) throw new Error('영상 주소가 있어야 한다');
  const range = await page.request.get(videoUrl, { headers: { Range: 'bytes=0-31' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(32);
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

  const directory = process.env.SMOKE_COMPOSE_DIR;
  const project = process.env.SMOKE_COMPOSE_PROJECT;
  if (!directory || !project?.startsWith('pc-smoke-')) throw new Error('격리 Compose 정보가 필요합니다.');
  await promisify(execFile)('docker', [
    'compose',
    '--project-name',
    project,
    '--env-file',
    `${directory}/.env`,
    '-f',
    `${directory}/compose.yaml`,
    'restart',
    'api',
    'web',
  ]);
  await expect.poll(async () => (await request.get('/backend/health')).status()).toBe(200);
  await page.reload();
  await expect(photo.getByRole('button', { name: '운영 사진 댓글 1개', exact: true })).toBeVisible();
  expect((await page.request.get(mediaUrl)).status()).toBe(200);
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '배포 검증 회원', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /운영 이미지 그룹/ })).toBeVisible();
  expect(errors).toEqual([]);
});
