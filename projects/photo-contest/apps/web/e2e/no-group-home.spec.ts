import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '가입 그룹이 없는 홈에서 탐색·검색·사진 감상 후 가입하면 내 피드로 바뀌어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    await signIn('홈 신규 사용자');
    const owner = await createTestUser(API_URL, { nickname: '홈 목록 그룹장', origin: WEB_ORIGIN });
    const suffix = Date.now().toString(36);
    const group = await seedGroup(owner, `공개 목록 ${suffix}`, 'PUBLIC');
    const secret = await seedGroup(owner, `비공개 목록 ${suffix}`, 'PRIVATE');
    const hidden = await seedGroup(owner, `숨긴 목록 ${suffix}`, 'PUBLIC');
    await seedPost(owner, secret.id, `비밀사진 ${suffix}`);
    const hiddenId = await seedPost(owner, hidden.id, `숨긴사진 ${suffix}`);
    await productRequest(owner, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', { id: hiddenId });
    await seedPost(owner, group.id, `공개사진 ${suffix}`);

    await page.goto('/');
    const groups = page.getByRole('region', { name: '공개 그룹 목록' });
    await expect(groups.getByRole('link', { name: `공개 목록 ${suffix}`, exact: true })).toBeVisible();
    await expect(groups.getByText(`비공개 목록 ${suffix}`, { exact: true })).toHaveCount(0);
    const publicFeed = page.getByRole('region', { name: '공개 그룹의 최신 사진' });
    const post = publicFeed.getByRole('article', { name: `공개사진 ${suffix}`, exact: true });
    await expect(post.getByRole('img')).toBeVisible();
    await expect(post.getByRole('button', { name: /좋아요|댓글/ })).toHaveCount(0);
    await expect(page.getByText(`비밀사진 ${suffix}`, { exact: true })).toHaveCount(0);
    await expect(page.getByText(`숨긴사진 ${suffix}`, { exact: true })).toHaveCount(0);
    await post.getByRole('link', { name: '그룹 보기', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await page.goto('/');
    await page.getByRole('textbox', { name: '그룹 검색' }).fill(`공개 목록 ${suffix}`);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page).toHaveURL(/\/explore\?q=/);
    await expect(page.getByRole('link', { name: `공개 목록 ${suffix}`, exact: true })).toBeVisible();
    await page.goto('/');
    await groups
      .getByRole('article')
      .filter({ has: page.getByRole('link', { name: `공개 목록 ${suffix}`, exact: true }) })
      .getByRole('button', { name: '그룹 가입하기' })
      .click();
    await expect(page.getByRole('region', { name: '공개 그룹 목록' })).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: `공개사진 ${suffix}`, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);

test(
  '인증 화면에서는 콘텐츠를 숨기고 익명 시작 후 공개 피드만 보여 줘야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page }) => {
    const owner = await createTestUser(API_URL, { nickname: '익명홈 목록 그룹장', origin: WEB_ORIGIN });
    const suffix = Date.now().toString(36);
    const group = await seedGroup(owner, `익명 공개 ${suffix}`, 'PUBLIC');
    const secret = await seedGroup(owner, `익명 비공개 ${suffix}`, 'PRIVATE');
    await seedPost(owner, secret.id, `익명 비밀 ${suffix}`);
    await seedPost(owner, group.id, `익명 공개사진 ${suffix}`);
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign\?/);
    await expect(page.getByRole('region', { name: '공개 그룹의 최신 사진' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '로그인 없이 그룹 둘러보기' })).toHaveCount(0);
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(
      page
        .getByRole('region', { name: '공개 그룹의 최신 사진' })
        .getByRole('article', { name: `익명 공개사진 ${suffix}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`익명 비밀 ${suffix}`, { exact: true })).toHaveCount(0);
  },
);
