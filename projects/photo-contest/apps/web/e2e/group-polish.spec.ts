import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '빈 그룹의 첫 게시물 행동은 모바일 첫 화면에서 현재 그룹 작성으로 이어져야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('첫 게시물 안내');
    const group = await seedGroup(cookie, '첫 순간을 모으는 그룹');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/groups/${group.id}`);
    const firstPost = page.getByRole('link', { name: '첫 게시물 쓰기', exact: true });
    await expect(firstPost).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('region', { name: '이달의 인기' }).locator('.lucide-images')).toHaveCount(0);
    await firstPost.click();
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
  },
);

test(
  '상단 멤버 진입은 기존 초대 영역을 열고 긴 카테고리는 감싸며 빈 필터를 복구해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('그룹 정보와 필터');
    const group = await seedGroup(cookie, '함께 기억하는 이야기');
    for (const index of [1, 2, 3, 4, 5, 6])
      await productRequest(
        cookie,
        'mutation($id:ID!,$title:String!){createPost(groupId:$id,title:$title,body:"함께 모은 이야기",linkUrl:"https://example.com/memory",rightsConfirmed:true){id}}',
        { id: group.id, title: `모아 둔 순간 ${index}` },
      );
    const name = '아주긴카테고리이름'.repeat(4).slice(0, 20);
    const { createGroupCategory: category } = await productRequest<{ createGroupCategory: { id: string } }>(
      cookie,
      'mutation($id:ID!,$name:String!){createGroupCategory(groupId:$id,name:$name){id}}',
      { id: group.id, name },
    );
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/groups/${group.id}`);
    const members = page.getByRole('button', { name: '초대와 멤버 보기', exact: true });
    await expect(members).toBeInViewport({ ratio: 1 });
    await expect(members).toBeEnabled();
    await members.focus();
    await page.keyboard.press('Enter');
    const details = page.locator(`#group-community-${group.id}`);
    await expect(details).toHaveJSProperty('open', true);
    await expect(details.locator('summary')).toBeFocused();
    await expect(details.locator('summary')).toBeInViewport({ ratio: 1 });
    await page.goto(`/groups/${group.id}?category=${category.id}&tag=a&tag=b#posts`);
    await page.setViewportSize({ width: 320, height: 900 });
    const filter = page.getByRole('navigation', { name: '게시물 카테고리' });
    const categoryButton = filter.getByRole('button', { name, exact: true });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true');
    const bounds = await categoryButton.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeLessThanOrEqual(288);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '전체 게시물 보기', exact: true }).click();
    await expect(filter.getByRole('button', { name: '전체', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const url = new URL(page.url());
    expect(url.searchParams.has('category')).toBe(false);
    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(url.hash).toBe('#posts');
    await expect(page.getByRole('button', { name: '전체 게시물 보기', exact: true })).toHaveCount(0);
    await expect(page.getByRole('article').first()).toBeVisible();
  },
);
