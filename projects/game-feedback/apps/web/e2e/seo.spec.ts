import { expect, test, type BrowserContext } from '@playwright/test';

import type { PostDetail } from '@game-feedback/contracts';

const origin = 'http://127.0.0.1:3301';
async function choose(context: BrowserContext, accountId: string) {
  const response = await context.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
test('every screen serves page-specific metadata without JavaScript and private screens stay noindex', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: 'bingbot' });
  try {
    const page = await context.newPage();
    for (const [path, title] of [
      ['', '게임 커뮤니티 홈'],
      ['/guide', 'Game Mate 이용 가이드'],
      ['/terms', '이용약관'],
      ['/privacy', '개인정보 처리 안내'],
      ['/contact', '문의 및 신고 안내'],
      ['/messages', '내 채팅'],
      ['/notifications', '내 알림'],
      ['/settings', '내 프로필 설정'],
    ] as const) {
      await page.goto(`${origin}/ko${path}`);
      await expect(page).toHaveTitle(`${title} | Game Mate`);
      await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', /.+/);
      await expect(page.locator('head meta[name="keywords"]')).toHaveAttribute('content', /게임 커뮤니티/);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://feedback.example/ko${path}`,
      );
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      const structuredData = page.locator('script[type="application/ld+json"]');
      if (['/messages', '/notifications', '/settings'].includes(path)) {
        await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /nofollow/);
        await expect(structuredData).toHaveCount(0);
        continue;
      }
      await expect(structuredData).toHaveCount(1);
      const graph = JSON.parse((await structuredData.textContent()) || '{}');
      expect(graph).toMatchObject({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': 'https://feedback.example/#website',
            url: 'https://feedback.example/',
          },
          {
            '@type': path === '/contact' ? 'ContactPage' : 'WebPage',
            url: `https://feedback.example/ko${path}`,
            isPartOf: { '@id': 'https://feedback.example/#website' },
          },
        ],
      });
    }
    await page.goto(`${origin}/ja/contact?utm_source=test`);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://feedback.example/ja/contact',
    );
    const translated = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) || '{}',
    );
    expect(translated['@graph'][1].url).toBe('https://feedback.example/ja/contact');
    const image = await context.request.get(`${origin}/og`);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
    const png = await image.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(await (await context.request.get(`${origin}/robots.txt`)).text()).toContain('Disallow: /');
    expect(await (await context.request.get(`${origin}/sitemap.xml`)).text()).not.toContain('/users/');
  } finally {
    await context.close();
  }
});

test('post content, discussion markup, author profile and authored posts are server rendered', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: 'bingbot' });
  try {
    const detail = (await (
      await context.request.get(`${origin}/api/posts/sample-post-0`)
    ).json()) as PostDetail;
    const page = await context.newPage();
    const response = await page.goto(`${origin}/ko/posts/sample-post-0`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(`${detail.post.title} | Game Mate`);
    await expect(page.getByRole('heading', { name: detail.post.title, level: 1 })).toBeVisible();
    await expect(page.locator('.detail-card .prose-body')).toHaveText(detail.post.body);
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://feedback.example/ko/posts/sample-post-0',
    );
    const discussion = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) || '{}',
    );
    expect(discussion).toMatchObject({
      '@type': 'DiscussionForumPosting',
      headline: detail.post.title,
      text: detail.post.body,
      url: 'https://feedback.example/ko/posts/sample-post-0',
      mainEntityOfPage: 'https://feedback.example/ko/posts/sample-post-0',
      author: { url: 'https://feedback.example/ko/users/sample-user-0' },
    });
    await page.locator('.detail-card').getByRole('link', { name: '새벽의호그 프로필' }).click();
    await expect(page).toHaveTitle('새벽의호그 플레이어 프로필 | Game Mate');
    await expect(page.getByRole('heading', { name: '새벽의호그', exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('.post-card').first()).toBeVisible();
    const profile = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) || '{}',
    );
    expect(profile).toMatchObject({
      '@type': 'ProfilePage',
      url: 'https://feedback.example/ko/users/sample-user-0',
      mainEntity: { '@type': 'Person', name: '새벽의호그' },
    });
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', profile.url);
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute('content', 'profile');
    for (const path of ['/ko/posts/missing-post', '/ko/users/missing-user']) {
      const missing = await page.goto(`${origin}${path}`);
      expect(missing?.status()).toBe(404);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
    }
  } finally {
    await context.close();
  }
});

test('blocked users cannot fetch author metadata or post content through server rendering', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: 'bingbot' });
  await choose(context, 'sample-user-0');
  await context.request.post(`${origin}/api/blocks`, {
    headers: { Origin: origin },
    data: { blockedUserId: 'sample-user-3' },
  });
  try {
    for (const path of ['/ko/users/sample-user-3', '/ko/posts/sample-post-3']) {
      const response = await context.request.get(`${origin}${path}`);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain('덱연구소');
    }
  } finally {
    await context.request.delete(`${origin}/api/blocks/sample-user-3`, { headers: { Origin: origin } });
    await context.close();
  }
});

test('switching accounts cannot reseed a blocked profile from the previous server snapshot', async ({
  browser,
}) => {
  const coach = await browser.newContext({ baseURL: origin });
  const context = await browser.newContext({ baseURL: origin });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await choose(coach, 'sample-user-3');
    await coach.request.post('/api/blocks', {
      headers: { Origin: origin },
      data: { blockedUserId: 'sample-user-0' },
    });
    await choose(context, 'sample-user-0');
    const page = await context.newPage();
    const first = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/users/sample-user-0',
    );
    await page.goto('/ko/users/sample-user-0');
    await first;
    await expect(page.locator('.public-profile')).toBeVisible();
    await page.route('**/api/users/sample-user-0', async (route) => {
      await gate;
      await route.continue();
    });
    const refresh = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/users/sample-user-0',
    );
    await choose(context, 'sample-user-3');
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await refresh;
    await expect(page.locator('.public-profile')).toHaveCount(0);
    await expect(page.locator('.post-card')).toHaveCount(0);
    release();
    await expect(page.getByRole('alert', { name: '플레이어 프로필 오류' })).toBeVisible();
  } finally {
    release();
    await coach.request.delete('/api/blocks/sample-user-0', { headers: { Origin: origin } });
    await context.close();
    await coach.close();
  }
});
