import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { PostDetailSchema, PostSchema } from '@game-feedback/contracts';

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
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    const twitter = await page.locator('meta[name="twitter:image"]').getAttribute('content');
    expect(new URL(og || '').pathname).toBe(imagePath);
    expect(new URL(twitter || '').pathname).toBe(imagePath);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute('content', /\S/);
  }
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
