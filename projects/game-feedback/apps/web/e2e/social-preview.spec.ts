import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { PostDetailSchema, PostSchema, PublicProfileSchema } from '@game-feedback/contracts';

import { expect, test } from './support/test';

const output = '.data/og-detail-review';
const origin = 'http://127.0.0.1:3301';

test('공개 게시글과 프로필의 제목에 연결된 OG 카드가 생성되어야 한다', async ({ page, request }) => {
  await mkdir(output, { recursive: true });
  const generic = await readFile('public/brand/og-image.png');
  for (const [kind, id, document] of [
    ['posts', 'sample-post-0', '/ko/posts/sample-post-0'],
    ['users', 'sample-user-0', '/ko/users/sample-user-0'],
  ] as const) {
    const imagePath = `/og/${kind}/${id}`;
    const response = await request.get(imagePath);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    expect(response.headers()['cache-control']).toContain('no-store');
    const bytes = await response.body();
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes.equals(generic)).toBe(false);
    await writeFile(`${output}/${kind}.png`, bytes);
    await page.goto(document);
    const og = await page.locator('meta[property="og:image"]').last().getAttribute('content');
    const twitter = await page.locator('meta[name="twitter:image"]').last().getAttribute('content');
    expect(new URL(og || '').pathname).toBe(imagePath);
    expect(new URL(twitter || '').pathname).toBe(imagePath);
    await expect(page.locator('meta[property="og:image:alt"]').first()).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[name="twitter:image:alt"]').first()).toHaveAttribute('content', /\S/);
  }
});

test('프로필 사진이 있으면 생성 카드보다 먼저 공유하고 비회원도 사진을 볼 수 있어야 한다', async ({
  page,
  context,
  request,
}) => {
  const login = await context.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/ko/settings/profile');
  await page.getByLabel('프로필 사진 선택', { exact: true }).setInputFiles({
    name: 'profile.png',
    mimeType: 'image/png',
    buffer: await readFile('public/brand/og-image.png'),
  });
  await expect(page.getByRole('img', { name: '선택한 프로필 사진 미리보기' })).toBeVisible();
  await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
  await expect(page).toHaveURL('/ko/users/sample-user-0');
  const profile = PublicProfileSchema.parse(await (await request.get('/api/users/sample-user-0')).json());
  const avatar = profile.author.avatarUrl;
  expect(avatar).toBeTruthy();
  const paths = await page.locator('meta[property="og:image"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const url = new URL(node.getAttribute('content') || '');
      return url.pathname + url.search;
    }),
  );
  expect(paths).toEqual([avatar, '/og/users/sample-user-0']);
  if (!avatar) throw new Error('Expected a saved profile photo');
  expect((await request.get(avatar)).ok()).toBe(true);
  expect((await context.request.delete('/api/profile/avatar', { headers: { Origin: origin } })).ok()).toBe(
    true,
  );
});

test('삭제된 글과 없는 프로필에는 원문을 공개하지 않고 기본 이미지를 반환해야 한다', async ({ request }) => {
  const headers = { Origin: origin };
  expect(
    (await request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } })).ok(),
  ).toBe(true);
  const sample = PostDetailSchema.parse(await (await request.get('/api/posts/sample-post-0')).json());
  const created = await request.post('/api/posts', {
    headers,
    data: {
      title: '삭제할 공유 카드 글',
      body: '삭제 뒤에는 이 내용이 이미지에 남으면 안 됩니다.',
      board: 'FREE',
      categoryId: sample.post.categoryId,
    },
  });
  expect(created.ok()).toBe(true);
  const post = PostSchema.parse(await created.json());
  const original = await readFile('public/brand/og-image.png');
  const published = await request.get(`/og/posts/${post.id}`);
  expect(published.ok()).toBe(true);
  expect((await published.body()).equals(original)).toBe(false);
  expect((await request.delete(`/api/posts/${post.id}`, { headers })).ok()).toBe(true);
  for (const path of [`/og/posts/${post.id}`, '/og/users/missing-social-user']) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.body()).toEqual(original);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
