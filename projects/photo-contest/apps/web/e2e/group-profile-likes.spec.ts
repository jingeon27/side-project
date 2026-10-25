import { mkdir } from 'node:fs/promises';

import { createTestImage, uploadTestPostMedia } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { isStorageUpload, productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '그룹 사진 선택·미리보기·프로필 수정·삭제가 탐색과 MY 및 SEO에 반영되어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn('그룹 프로필 편집자');
    const group = await seedGroup(owner, `사진 그룹-${testInfo.project.name}`);
    const path = `/groups/${group.id}`;
    // 변경 전 공개 캐시도 채워 새 프로필이 JSON mutation 뒤 바로 갱신되는지 확인한다.
    await page.request.get(path, { headers: { 'User-Agent': 'Twitterbot' } });
    await page.goto(path);
    await page.getByRole('button', { name: '그룹 프로필 수정' }).click();
    const editor = page.getByRole('dialog', { name: '그룹 프로필 수정', exact: true });
    await editor.getByLabel('그룹 사진 선택').setInputFiles({
      name: 'group.png',
      mimeType: 'image/png',
      buffer: await createTestImage(),
    });
    const preview = editor.getByRole('img', { name: '그룹 사진 미리보기' });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    const name = `밤별의 순간-${testInfo.project.name}`;
    const description = '우연히 담은 별난 순간들을 함께 나눠요.';
    await editor.getByLabel('그룹 이름').fill(name);
    await editor.getByLabel('그룹 소개').fill(description);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/${testInfo.project.name}-group-profile.png`,
      animations: 'disabled',
    });
    await page.route(isStorageUpload, (route) => route.abort('failed'));
    await editor.getByRole('button', { name: '프로필 저장하기' }).click();
    await expect(editor.getByRole('alert')).toHaveText(
      '파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    await expect(editor.getByLabel('그룹 이름')).toHaveValue(name);
    await expect(preview).toBeVisible();
    await page.unroute(isStorageUpload);
    const mutations: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/backend/graphql')) {
        expect(req.headers()['content-type']).toContain('application/json');
        mutations.push(req.postData() ?? '');
      }
    });
    await editor.getByRole('button', { name: '프로필 저장하기' }).click();
    await expect(editor).toHaveCount(0);
    expect(mutations.some((body) => body.includes('completeGroupAvatarUpload'))).toBe(true);
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    const { group: profile } = await productRequest<{ group: { avatarUrl: string } }>(
      owner,
      'query($id:ID!){group(id:$id){avatarUrl}}',
      { id: group.id },
    );
    await expect(page.locator(`img[src="${profile.avatarUrl}"]`)).toBeVisible();
    const html = await (await page.request.get(path, { headers: { 'User-Agent': 'Twitterbot' } })).text();
    expect(html).toContain(description);
    expect(html).toContain(WEB_ORIGIN + profile.avatarUrl);
    await page.goto(`/explore?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    await page.goto('/me');
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    await page.goto(path);
    await page.getByRole('button', { name: '그룹 프로필 수정' }).click();
    await editor.getByRole('button', { name: '사진 삭제', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await editor.getByRole('button', { name: '프로필 저장하기' }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator(`img[src="${profile.avatarUrl}"]`)).toHaveCount(0);
  },
);

test(
  '대회 좋아요 기본값 1을 변경하고 설정한 한도까지 선택·취소·재선택할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn('좋아요 한도 대회장');
    const group = await seedGroup(owner, '좋아요 한도 브라우저 그룹');
    const path = `/groups/${group.id}`;
    await page.goto(`${path}/contests`);
    await page.getByRole('button', { name: '대회 개최하기', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '그룹 대회 개최', exact: true });
    const limit = editor.getByLabel('1인당 좋아요 한도');
    await expect(limit).toHaveValue('1');
    await expect(limit).toHaveAttribute('required', '');
    await limit.fill('2');
    await editor.getByLabel('대회 제목').fill('두 개를 고르는 대회');
    await editor.getByRole('button', { name: '대회 개최하기', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}/contests/[^/]+$`));
    const contestId = new URL(page.url()).pathname.split('/').at(-1);
    if (!contestId) throw new Error('대회 ID가 있어야 한다');
    const contestPath = new URL(page.url()).pathname;
    for (const title of ['첫 번째 순간', '두 번째 순간', '세 번째 순간']) {
      const uploadId = await uploadTestPostMedia(API_URL, {
        cookie: owner,
        origin: WEB_ORIGIN,
        groupId: group.id,
        body: await createTestImage(),
        contentType: 'image/png',
      });
      await productRequest(
        owner,
        'mutation($groupId:ID!,$contestId:ID!,$uploadId:ID!,$title:String!){createPost(groupId:$groupId,contestId:$contestId,uploadId:$uploadId,title:$title,rightsConfirmed:true){id}}',
        { groupId: group.id, contestId, uploadId, title },
      );
    }
    await page.goto(contestPath);
    const first = page.getByRole('button', { name: '첫 번째 순간 좋아요', exact: true });
    const second = page.getByRole('button', { name: '두 번째 순간 좋아요', exact: true });
    const third = page.getByRole('button', { name: '세 번째 순간 좋아요', exact: true });
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await second.click();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await third.click();
    await expect(
      page.getByRole('region', { name: '알림', exact: true }).getByText(/이 대회에서는 2개 작품까지만/),
    ).toBeVisible();
    await expect(third).toHaveAttribute('aria-pressed', 'false');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await third.click();
    await expect(third).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(third).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({
      path: `.data/screens/${testInfo.project.name}-contest-like-limit.png`,
      animations: 'disabled',
    });
  },
);
