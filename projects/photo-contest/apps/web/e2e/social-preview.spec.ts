import { mkdir, readFile, writeFile } from 'node:fs/promises';

import dayjs from 'dayjs';

import { graphqlRequest, uploadTestPostMedia } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { authenticate, expect, seedGroup, test } from './support/test';

const output = '.data/og-detail-review';

test('공개 그룹과 대회는 실제 제목과 대표 사진을 담은 공유 카드를 제공해야 한다', async ({
  page,
  context,
}) => {
  const cookie = await authenticate(context, '공유카드 작성자');
  const group = await seedGroup(cookie, '함께 모으는 우리의 순간');
  const call = async <T>(query: string, variables: Record<string, unknown> = {}) => {
    const result = await graphqlRequest<T>(API_URL, { query, variables, cookie, origin: WEB_ORIGIN });
    expect(result.errors).toBeUndefined();
    if (!result.data) throw new Error('Expected product data');
    return result.data;
  };
  const bytes = await readFile('../../../blog/apps/web/public/images/covers/reading-ai-code.png');
  const uploadId = await uploadTestPostMedia(API_URL, {
    cookie,
    origin: WEB_ORIGIN,
    groupId: group.id,
    body: bytes,
    contentType: 'image/png',
  });
  await call(
    'mutation($groupId:ID!,$uploadId:ID!){createPost(groupId:$groupId,uploadId:$uploadId,rightsConfirmed:true,title:"일상의 재미있는 장면"){id}}',
    { groupId: group.id, uploadId },
  );
  const { createGroupContest: contest } = await call<{ createGroupContest: { id: string } }>(
    'mutation($groupId:ID!,$start:DateTime!,$submission:DateTime!,$end:DateTime!){createGroupContest(groupId:$groupId,title:"우리끼리 웃음 대회",startsAt:$start,submissionEndsAt:$submission,endsAt:$end){id}}',
    {
      groupId: group.id,
      start: dayjs().add(1, 'minute').toISOString(),
      submission: dayjs().add(1, 'day').toISOString(),
      end: dayjs().add(2, 'day').toISOString(),
    },
  );
  await mkdir(output, { recursive: true });
  const generic = await readFile('public/brand/og-image.png');
  for (const [kind, document, imagePath] of [
    ['group', `/groups/${group.id}`, `/og/groups/${group.id}`],
    [
      'contest',
      `/groups/${group.id}/contests/${contest.id}`,
      `/og/groups/${group.id}/contests/${contest.id}`,
    ],
  ] as const) {
    const response = await context.request.get(imagePath);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    expect(response.headers()['cache-control']).toContain('no-store');
    const image = await response.body();
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
    expect(image.equals(generic)).toBe(false);
    await writeFile(`${output}/${kind}.png`, image);
    await page.goto(document);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    const twitter = await page.locator('meta[name="twitter:image"]').getAttribute('content');
    expect(new URL(og || '').pathname).toBe(imagePath);
    expect(new URL(twitter || '').pathname).toBe(imagePath);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute('content', /\S/);
  }
});

test('그룹장 세션이 있어도 비공개 그룹과 없는 그룹의 내용은 OG에 노출하지 않아야 한다', async ({
  context,
  page,
}) => {
  const cookie = await authenticate(context, '비공개 그룹장');
  const group = await seedGroup(cookie, '공개되면 안 되는 그룹 이름', 'PRIVATE');
  await page.goto(`/groups/${group.id}`);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:title"]')).not.toHaveAttribute('content', /공개되면 안 되는/);
  const generic = await readFile('public/brand/og-image.png');
  for (const path of [
    `/og/groups/${group.id}`,
    `/og/groups/${group.id}/contests/not-public`,
    '/og/groups/00000000-0000-4000-8000-000000000000',
  ] as const) {
    const response = await context.request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.body()).toEqual(generic);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
