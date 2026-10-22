import { mkdir } from 'node:fs/promises';

import { WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { authenticate, expect, seedGroup, test, waitForHydrationOnLoad } from './support/test';

test(
  '공개 그룹은 링크 없이 탐색하고 로그인 없이 사진·댓글·SEO를 읽을 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, request, signIn }, testInfo) => {
    const owner = await signIn(`탐색-${testInfo.project.name}`);
    const name = `공개-${testInfo.project.name}-${Date.now()}`;
    await page.goto('/explore');
    await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    const form = page.getByRole('dialog', { name: '그룹 만들기', exact: true });
    await expect(form.getByRole('radio', { name: /^공개 그룹/ })).toBeChecked();
    await form.getByLabel('그룹 이름').fill(name);
    await form.getByLabel('그룹 이름').press('Enter');
    await expect(page).toHaveURL(/\/groups\/[^/]+$/);
    const groupPath = new URL(page.url()).pathname;
    const groupId = groupPath.split('/').at(-1);
    if (!groupId) throw new Error('그룹 주소가 있어야 한다');
    const title = '공개 사진 </script><script>window.__seoXss=1</script>';
    const postId = await seedPost(owner, groupId, title);
    await productRequest(
      owner,
      'mutation($id:ID!){createPostComment(postId:$id,body:"공개 사진 이야기"){id}}',
      { id: postId },
    );
    const secret = await seedGroup(owner, `색인 제외-${Date.now()}`, 'PRIVATE');
    const secretTitle = '공개 응답에 나오면 안 되는 비공개 사진';
    await seedPost(owner, secret.id, secretTitle);

    await context.clearCookies();
    await page.goto('/');
    await page.getByRole('link', { name: '로그인 없이 그룹 둘러보기' }).click();
    await expect(page).toHaveURL('/explore');
    await expect(page.getByRole('heading', { name: '그룹 탐색', exact: true })).toBeVisible();
    await page.getByRole('search').getByRole('textbox', { name: '그룹 검색', exact: true }).fill(name);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/explore' && url.searchParams.get('q') === name);
    await expect(page.getByRole('region', { name: '탐색할 그룹' }).getByRole('article')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/${testInfo.project.name}-group-explore.png`,
      fullPage: true,
    });
    await page.getByRole('region', { name: '탐색할 그룹' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(groupPath);
    const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
    const article = latest.getByRole('article', { name: title, exact: true });
    await expect(article.getByRole('img')).toBeVisible();
    expect((await request.get(`/backend/media/${postId}`)).status()).toBe(200);
    await article.getByRole('button', { name: `${title} 댓글 1개`, exact: true }).click();
    const comments = page.getByRole('dialog', { name: '댓글', exact: true });
    await expect(comments.getByText('공개 사진 이야기', { exact: true })).toBeVisible();
    await expect(comments.getByRole('link', { name: '그룹에 가입하고 댓글 남기기' })).toBeVisible();
    await expect(comments.getByRole('textbox', { name: '댓글', exact: true })).toHaveCount(0);
    await comments.getByRole('button', { name: '닫기', exact: true }).click();
    expect(await page.evaluate(() => '__seoXss' in window)).toBe(false);

    const response = await request.get(`${groupPath}?utm_source=duplicate`, {
      headers: { 'User-Agent': 'Twitterbot' },
    });
    expect(response.status()).toBe(200);
    const seo = await page.evaluate(
      (html) => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        return {
          title: document.title,
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
          ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
          robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
          ld: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) =>
            JSON.parse(script.textContent ?? '{}'),
          ),
          headings: Array.from(document.querySelectorAll('h3')).map((node) => node.textContent),
          errors: document.querySelectorAll('template[data-dgst]').length,
        };
      },
      await response.text(),
    );
    expect(seo.title).toBe(`${name} · 별사대`);
    expect(seo.canonical).toBe(WEB_ORIGIN + groupPath);
    expect(seo.ogImage).toBe(`${WEB_ORIGIN}/backend/media/${postId}`);
    expect(seo.robots).toContain('index');
    expect(seo.robots).not.toContain('noindex');
    expect(seo.headings).toContain(title);
    expect(seo.errors).toBe(0);
    expect(seo.ld).toHaveLength(1);
    expect(seo.ld[0]).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({ '@type': 'CollectionPage' }),
        expect.objectContaining({ '@type': 'BreadcrumbList' }),
      ]),
    });

    const privateResponse = await request.get(`/groups/${secret.id}`);
    expect(privateResponse.status()).toBe(200);
    expect(await privateResponse.text()).not.toContain(secretTitle);
    const ownerPrivateResponse = await request.get(`/groups/${secret.id}`, {
      headers: { Cookie: owner, 'User-Agent': 'Twitterbot' },
    });
    const privateSeo = await page.evaluate(
      (html) => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        return {
          robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
          ldCount: document.querySelectorAll('script[type="application/ld+json"]').length,
        };
      },
      await ownerPrivateResponse.text(),
    );
    expect(privateSeo.robots).toContain('noindex');
    expect(privateSeo.ldCount).toBe(0);

    const indexResponse = await request.get('/sitemap.xml');
    expect(indexResponse.status()).toBe(200);
    const index = await page.evaluate(
      (xml) =>
        Array.from(new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('loc')).map(
          (node) => node.textContent ?? '',
        ),
      await indexResponse.text(),
    );
    const urls: string[] = [];
    for (const sitemap of index) {
      const document = await request.get(sitemap);
      expect(document.status()).toBe(200);
      urls.push(
        ...(await page.evaluate(
          (xml) =>
            Array.from(new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('loc')).map(
              (node) => node.textContent ?? '',
            ),
          await document.text(),
        )),
      );
    }
    expect(urls).toContain(WEB_ORIGIN + groupPath);
    expect(urls).not.toContain(`${WEB_ORIGIN}/groups/${secret.id}`);
    expect(urls).not.toContain(`${WEB_ORIGIN}/me`);
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain(`Sitemap: ${WEB_ORIGIN}/sitemap.xml`);
    expect((await request.get('/sitemaps/groups/invalid.xml')).status()).toBe(404);
    // 색인에 없는 번호는 실제 페이지 수를 넘으므로 조회하지 않고 404다.
    expect((await request.get(`/sitemaps/groups/${index.length + 1000}.xml`)).status()).toBe(404);
    const missing = await request.get('/groups/missing-seo-group', {
      headers: { 'User-Agent': 'Twitterbot' },
    });
    expect([200, 404]).toContain(missing.status());
    expect(await missing.text()).toContain('noindex');
  },
);

test(
  '비공개 그룹은 신청을 거절·수락하고 승인된 멤버만 사진과 글쓰기를 이용해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, browser, signIn }, testInfo) => {
    const owner = await signIn(`비공개-${testInfo.project.name}`);
    await page.goto('/explore');
    await page.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    const form = page.getByRole('dialog', { name: '그룹 만들기', exact: true });
    await form.getByLabel('그룹 이름').fill(`승인-${testInfo.project.name}-${Date.now()}`);
    await form.getByRole('radio', { name: /^비공개 그룹/ }).check();
    await form.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/[^/]+$/);
    const groupPath = new URL(page.url()).pathname;
    const groupId = groupPath.split('/').at(-1);
    if (!groupId) throw new Error('그룹 주소가 있어야 한다');
    const postId = await seedPost(owner, groupId, '승인한 멤버에게만 보이는 순간');
    const nickname = `신청자-${testInfo.project.name}`;
    const applicantContext = await browser.newContext({
      baseURL: WEB_ORIGIN,
      viewport: page.viewportSize() ?? { width: 1280, height: 800 },
    });
    const errors: string[] = [];
    try {
      const applicant = await authenticate(applicantContext, nickname);
      const applicantPage = waitForHydrationOnLoad(await applicantContext.newPage());
      applicantPage.on('pageerror', (error) => errors.push(error.message));
      await applicantPage.goto(groupPath);
      await expect(applicantPage.getByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
      await applicantPage.getByRole('button', { name: '가입 신청하기', exact: true }).click();
      await expect(
        applicantPage.getByRole('button', { name: '가입 승인 대기 중', exact: true }),
      ).toBeDisabled();
      // 승인 전에는 비공개 그룹의 게시물 파일이 있는지도 알리지 않는다.
      expect((await applicantPage.request.get(`/backend/media/${postId}`)).status()).toBe(404);
      const before = await productRequest<{ myGroups: Array<{ id: string }> }>(applicant, '{myGroups{id}}');
      expect(before.myGroups.map((group) => group.id)).not.toContain(groupId);
      const requests = page.getByRole('region', { name: '가입 신청 관리' });
      await requests.getByRole('button', { name: '신청 새로고침', exact: true }).click();
      await requests.getByRole('button', { name: `${nickname} 가입 거절`, exact: true }).click();
      await expect(requests.getByText('대기 중인 가입 신청이 없어요.')).toBeVisible();
      await applicantPage.getByRole('button', { name: '승인 상태 확인', exact: true }).click();
      await applicantPage.getByRole('button', { name: '가입 신청하기', exact: true }).click();
      await expect(
        applicantPage.getByRole('button', { name: '가입 승인 대기 중', exact: true }),
      ).toBeDisabled();
      await requests.getByRole('button', { name: '신청 새로고침', exact: true }).click();
      await requests.getByRole('button', { name: `${nickname} 가입 수락`, exact: true }).click();
      await expect(requests.getByText('대기 중인 가입 신청이 없어요.')).toBeVisible();
      await applicantPage.getByRole('button', { name: '승인 상태 확인', exact: true }).click();
      await expect(
        applicantPage
          .getByRole('region', { name: '최신 게시물', exact: true })
          .getByRole('article', { name: '승인한 멤버에게만 보이는 순간', exact: true }),
      ).toBeVisible();
      await expect(applicantPage.getByRole('button', { name: '글쓰기', exact: true })).toBeVisible();
      expect((await applicantPage.request.get(`/backend/media/${postId}`)).status()).toBe(200);
      await applicantPage.goto('/me');
      await expect(
        applicantPage.getByRole('link').filter({ hasText: `승인-${testInfo.project.name}` }),
      ).toBeVisible();
      expect(errors).toEqual([]);
      await mkdir('.data/screens', { recursive: true });
      await page.screenshot({
        path: `.data/screens/${testInfo.project.name}-private-group.png`,
        fullPage: true,
      });
    } finally {
      await applicantContext.close();
    }
  },
);
