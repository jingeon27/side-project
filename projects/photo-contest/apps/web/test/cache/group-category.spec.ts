import { createTestUser, graphqlRequest } from '@photo-contest/test-kit';

import { expect, test } from '../../e2e/support/test';
import { CACHE_API_URL, CACHE_WEB_ORIGIN } from './env';

test('실제 프로덕션에서 카테고리 생성·등록·필터·부관리자 수정·보관을 사용할 수 있어야 한다', async ({
  page,
  context,
  request,
}) => {
  const owner = await createTestUser(CACHE_API_URL, {
    origin: CACHE_WEB_ORIGIN,
    nickname: '카테고리 운영자',
  });
  const member = await createTestUser(CACHE_API_URL, {
    origin: CACHE_WEB_ORIGIN,
    nickname: '카테고리 작성자',
  });
  const moderator = await createTestUser(CACHE_API_URL, {
    origin: CACHE_WEB_ORIGIN,
    nickname: '카테고리 부관리자',
  });
  const product = async <T>(cookie: string, query: string, variables: Record<string, unknown> = {}) => {
    const result = await graphqlRequest<T>(CACHE_API_URL, {
      cookie,
      query,
      variables,
      origin: CACHE_WEB_ORIGIN,
    });
    if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
    return result.data;
  };
  const userId = async (cookie: string) => (await product<{ me: { id: string } }>(cookie, '{me{id}}')).me.id;
  const setUser = async (cookie: string) =>
    context.addCookies([
      {
        name: 'contest_session',
        value: cookie.slice('contest_session='.length),
        url: CACHE_WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  const { createGroup: group } = await product<{ createGroup: { id: string } }>(
    owner,
    'mutation{createGroup(name:"카테고리 UI 그룹",visibility:PUBLIC){id}}',
  );
  for (const cookie of [member, moderator])
    await product(cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', { id: group.id });
  await product(owner, 'mutation($g:ID!,$u:ID!){setGroupModerator(groupId:$g,userId:$u,enabled:true){id}}', {
    g: group.id,
    u: await userId(moderator),
  });
  await setUser(owner);
  await page.goto(`/groups/${group.id}`);
  await page.getByText('카테고리 관리', { exact: true }).click();
  const manager = page.locator('details').filter({ has: page.getByText('카테고리 관리', { exact: true }) });
  for (const name of ['합성', '순간포착']) {
    await manager.getByRole('textbox', { name: /새 카테고리/ }).fill(name);
    await manager.getByRole('button', { name: '카테고리 만들기', exact: true }).click();
    await expect(manager.getByRole('textbox', { name: new RegExp(`${name} 이름`) })).toBeVisible();
  }
  await manager.getByRole('button', { name: '순간포착 위로', exact: true }).click();
  await expect
    .poll(async () =>
      (
        await product<{ group: { categories: { name: string }[] } }>(
          owner,
          'query($id:ID!){group(id:$id){categories{name}}}',
          { id: group.id },
        )
      ).group.categories.map((c) => c.name),
    )
    .toEqual(['순간포착', '합성']);
  const categories = (
    await product<{ group: { categories: { id: string; name: string }[] } }>(
      owner,
      'query($id:ID!){group(id:$id){categories{id name}}}',
      { id: group.id },
    )
  ).group.categories;
  expect(categories.map((c) => c.name)).toEqual(['순간포착', '합성']);
  const category = categories.find((c) => c.name === '합성');
  if (!category) throw new Error('분류가 있어야 한다.');
  await setUser(member);
  await page.goto(`/groups/${group.id}`);
  await expect(page.getByText('카테고리 관리', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
  await editor.getByRole('textbox', { name: /제목/ }).fill('분류를 고른 게시물');
  await editor.getByRole('textbox', { name: /링크/ }).fill('https://example.com/category');
  await editor.getByRole('combobox', { name: /카테고리/ }).selectOption(category.id);
  await editor.getByRole('checkbox', { name: /공유할 권리/ }).check();
  await editor.getByRole('button', { name: '게시물 올리기' }).click();
  await expect(editor).toHaveCount(0);
  const filter = page.getByRole('navigation', { name: '게시물 카테고리' });
  await filter.getByRole('button', { name: '합성', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`category=${category.id}`));
  await expect(
    page
      .getByRole('region', { name: '최신 게시물', exact: true })
      .getByRole('article', { name: '분류를 고른 게시물', exact: true }),
  ).toBeVisible();
  const canonical = await request.get(`/groups/${group.id}?category=${category.id}`, {
    headers: { 'User-Agent': 'Twitterbot' },
  });
  expect(await canonical.text()).toContain(`rel="canonical" href="${CACHE_WEB_ORIGIN}/groups/${group.id}"`);
  await setUser(moderator);
  await page.goto(`/groups/${group.id}`);
  await page.getByText('카테고리 관리', { exact: true }).click();
  await manager.getByRole('textbox', { name: '합성 이름', exact: false }).fill('편집');
  await manager
    .locator('li')
    .filter({ has: page.getByRole('textbox', { name: /합성 이름/ }) })
    .getByRole('button', { name: '이름 변경', exact: true })
    .click();
  await expect(manager.getByRole('button', { name: '편집 보관', exact: true })).toBeVisible();
  await manager.getByRole('button', { name: '편집 보관', exact: true }).click();
  await page.getByRole('button', { name: '보관하기', exact: true }).click();
  await expect(manager.getByRole('button', { name: '편집 보관', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window.history.state ?? {}, '__photoContestOverlay')))
    .toBeUndefined();
  await setUser(member);
  await page.goto(`/groups/${group.id}?category=${category.id}`);
  await expect(
    page
      .getByRole('navigation', { name: '게시물 카테고리' })
      .getByRole('button', { name: '전체', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page
      .getByRole('region', { name: '최신 게시물', exact: true })
      .getByText('편집 · 보관됨', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: '그룹에 글쓰기' })
      .getByRole('combobox', { name: /카테고리/ })
      .getByRole('option', { name: '편집', exact: true }),
  ).toHaveCount(0);
});
