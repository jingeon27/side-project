import { expect, seedGroup, test } from './support/test';

test(
  'URL의 검색어를 초기값으로 읽고 뒤로 가기와 다른 필터를 유지해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('검색 초기값과 기록');
    const name = `기록 검색-${crypto.randomUUID().slice(0, 8)}`;
    const group = await seedGroup(cookie, name);
    await page.goto(`/explore?q=${encodeURIComponent(name)}&tag=a&tag=b#results`);
    const input = page.getByRole('search').getByRole('textbox', { name: '그룹 검색', exact: true });
    await expect(input).toHaveValue(name);
    await page.getByRole('region', { name: '탐색할 그룹' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await page.goBack();
    await expect(input).toHaveValue(name);
    await input.fill(` ${name} `);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/explore' &&
        url.searchParams.get('q') === name &&
        url.searchParams.getAll('tag').join(',') === 'a,b' &&
        url.hash === '#results',
    );
  },
);

test(
  '탐색 로딩 화면이 실제 화면으로 교체되는 동안 검색어를 잃지 않아야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const cookie = await signIn('로딩 중 검색');
    const name = `로딩 뒤 검색-${crypto.randomUUID().slice(0, 8)}`;
    await seedGroup(cookie, name);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '참여한 그룹', exact: true })).toBeVisible();
    const gate = Promise.withResolvers<void>();
    await page.route('**/explore?*', async (route) => {
      const headers = route.request().headers();
      if (headers.rsc === '1' && !headers['next-router-prefetch']) await gate.promise;
      await route.continue();
    });
    const input = page.getByRole('search').getByRole('textbox', { name: '그룹 검색', exact: true });
    const submit = page.getByRole('button', { name: '검색', exact: true });
    try {
      await page.getByRole('link', { name: '탐색', exact: true }).click();
      await expect(page).toHaveURL('/explore');
      await expect(page.getByRole('status', { name: '그룹 목록 불러오는 중' })).toBeVisible();
      await expect(page.getByRole('search')).toHaveCount(0);
      await expect(submit).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('explore-search-pending.png') });
    } finally {
      gate.resolve();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await expect(input).toBeEditable();
    await expect(submit).toBeEnabled();
    await input.fill(name);
    await submit.click();
    await expect(page).toHaveURL((url) => url.pathname === '/explore' && url.searchParams.get('q') === name);
    const results = page.getByRole('region', { name: '탐색할 그룹' });
    await expect(results.getByRole('article')).toHaveCount(1);
    await expect(results.getByRole('link', { name, exact: true })).toBeVisible();
  },
);
