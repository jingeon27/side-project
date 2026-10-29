import { productRequest } from './support/photos';
import { authenticate, expect, seedGroup, test, waitForHydrationOnLoad } from './support/test';

test(
  '다른 탭에서 계정이 바뀌면 복귀한 MY에서 이전 개인 프로필·그룹·게시물을 남기지 않아야 한다',
  { tag: ['@desktop'] },
  async ({ page, context, signIn }, testInfo) => {
    const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const alice = `이전-${Date.now().toString(36)}`;
    const bob = `새계정-${Date.now().toString(36)}`;
    const cookie = await signIn(alice);
    const groupName = `이전 계정 그룹-${suffix}`;
    const postTitle = `이전 계정 개인 게시물-${suffix}`;
    const group = await seedGroup(cookie, groupName, 'PRIVATE');
    await productRequest(
      cookie,
      'mutation($group:ID!,$title:String!){createPost(groupId:$group,title:$title,linkUrl:"https://example.com/private",rightsConfirmed:true){id}}',
      { group: group.id, title: postTitle },
    );
    await page.addInitScript(() => {
      const key = 'account-session-document';
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key)) + 1));
    });
    await page.goto('/me#profile');
    await expect(page.getByRole('heading', { name: alice, exact: true })).toBeVisible();
    const posts = page.getByRole('region', { name: '올린 게시물', exact: true });
    await expect(posts.getByRole('article', { name: postTitle, exact: true })).toBeVisible();
    const documents = await page.evaluate(() => Number(sessionStorage.getItem('account-session-document')));
    const other = waitForHydrationOnLoad(await context.newPage());
    try {
      await other.bringToFront();
      // 테스트 API로 같은 브라우저의 쿠키만 교체한다. 첫 탭의 캐시나 DOM은 직접 바꾸지 않는다.
      await authenticate(context, bob);
      await other.goto('/me');
      await expect(other.getByRole('heading', { name: bob, exact: true })).toBeVisible();
      await page.bringToFront();
      // headless Chromium은 모든 탭을 focused로 에뮬레이션하므로 복귀 이벤트만 명시한다.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByRole('heading', { name: bob, exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/me#profile$/);
      await expect
        .poll(() => page.evaluate(() => Number(sessionStorage.getItem('account-session-document'))))
        .toBeGreaterThan(documents);
      await expect(page.getByRole('heading', { name: alice, exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('region', { name: '참여 그룹', exact: true }).getByText(groupName, { exact: true }),
      ).toHaveCount(0);
      await expect(posts.getByRole('article', { name: postTitle, exact: true })).toHaveCount(0);
    } finally {
      await other.close();
    }
  },
);
