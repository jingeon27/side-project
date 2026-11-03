import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '세션이 없어도 인증 화면으로 보내지 않고 로그인이 필요한 화면은 제자리에서 안내해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context }) => {
    for (const path of ['/', '/explore?q=test']) {
      await page.goto(path);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('button', { name: '익명으로 시작하기', exact: true })).toHaveCount(0);
    }
    for (const path of ['/me', '/notifications', '/onboarding', '/contests/missing', '/groups/new']) {
      await page.goto(path);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('button', { name: '익명으로 시작하기', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: '로그인', exact: true })).toBeVisible();
    }
    await page.goto('/groups/missing/write');
    await expect(page).toHaveURL('/groups/missing');
    await context.addCookies([
      {
        name: 'contest_session',
        value: 'expired'.repeat(8),
        url: new URL(page.url()).origin,
        httpOnly: true,
      },
    ]);
    await page.goto('/me');
    await expect(page).toHaveURL('/me');
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await expect(page).toHaveURL('/me');
    const session = (await context.cookies()).find((cookie) => cookie.name === 'contest_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.value).not.toBe('expired'.repeat(8));
  },
);

test(
  '세션 없이 공개 그룹을 읽고 검색 엔진에 공개 메타데이터를 내주며 가입은 인증 화면으로 안내해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, context }) => {
    const owner = await signIn('세션 없는 방문 그룹장');
    const suffix = crypto.randomUUID().slice(0, 8);
    const group = await seedGroup(owner, `세션 없는 공개 ${suffix}`, 'PUBLIC');
    const secret = await seedGroup(owner, `세션 없는 비공개 ${suffix}`, 'PRIVATE');
    const createLinkPost = (groupId: string, title: string) =>
      productRequest(
        owner,
        'mutation($groupId:ID!,$title:String!){createPost(groupId:$groupId,linkUrl:"https://example.com",title:$title,body:"",rightsConfirmed:true){id}}',
        { groupId, title },
      );
    await createLinkPost(group.id, `세션 없이 읽는 글 ${suffix}`);
    await createLinkPost(secret.id, `세션 없이 못 읽는 글 ${suffix}`);
    await context.clearCookies();

    await page.goto(`/groups/${group.id}`);
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await expect(
      page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: `세션 없이 읽는 글 ${suffix}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '로그인하고 가입하기', exact: true })).toHaveAttribute(
      'href',
      `/sign?next=${encodeURIComponent(`/groups/${group.id}`)}`,
    );

    for (const path of ['/', '/explore', `/groups/${group.id}`]) {
      const response = await page.request.get(path, {
        maxRedirects: 0,
        headers: { 'User-Agent': 'Googlebot' },
      });
      expect(response.status(), path).toBe(200);
      const robots = await page.evaluate(
        (html) =>
          new DOMParser()
            .parseFromString(html, 'text/html')
            .querySelector('meta[name="robots"]')
            ?.getAttribute('content'),
        await response.text(),
      );
      expect(robots, path).not.toContain('noindex');
    }
    const secretResponse = await page.request.get(`/groups/${secret.id}`, {
      maxRedirects: 0,
      headers: { 'User-Agent': 'Googlebot' },
    });
    const secretHtml = await secretResponse.text();
    expect(secretResponse.status()).toBe(200);
    expect(secretHtml).toContain('noindex');
    expect(secretHtml).not.toContain(`세션 없이 못 읽는 글 ${suffix}`);

    await page.goto(`/explore?${new URLSearchParams({ q: `세션 없는 비공개 ${suffix}` })}`);
    await page.getByRole('link', { name: `세션 없는 비공개 ${suffix}`, exact: true }).click();
    const prompt = page.getByRole('alertdialog', { name: '로그인이 필요해요' });
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL(/\/explore\?q=/);
    await prompt.getByRole('button', { name: '로그인하기', exact: true }).click();
    await expect(page).toHaveURL(`/sign?next=${encodeURIComponent(`/groups/${secret.id}`)}`);
  },
);
