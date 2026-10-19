import { mkdir } from 'node:fs/promises';
import { createTestImage, createTestUser, createTestVideo, moveTestContest } from '@photo-contest/test-kit';
import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '그룹 대회 개최·참여 선택·투표·명예의 전당과 공개 SEO가 이어져야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, request, signIn }, testInfo) => {
    const owner = await signIn(`대회장-${testInfo.project.name}`);
    const group = await seedGroup(owner, `대회 그룹-${testInfo.project.name}`);
    const groupPath = `/groups/${group.id}`;
    const title = `웃음 대회-${testInfo.project.name}`;
    await page.goto(groupPath);
    await page
      .getByRole('navigation', { name: '그룹 메뉴' })
      .getByRole('link', { name: '대회', exact: true })
      .click();
    await page.getByRole('button', { name: '대회 개최하기', exact: true }).click();
    const create = page.getByRole('dialog', { name: '그룹 대회 개최', exact: true });
    await create.getByLabel('대회 제목').fill(title);
    await expect(create.getByLabel('게시물 접수 마감')).toHaveAttribute('required', '');
    await create.getByRole('button', { name: '대회 개최하기', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${groupPath}/contests/[^/]+$`));
    const contestPath = new URL(page.url()).pathname;
    const contestId = contestPath.split('/').at(-1);
    if (!contestId) throw new Error('대회 ID가 있어야 한다');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
    await expect(sheet.getByRole('checkbox', { name: /대회에 참여하기/ })).toBeChecked();
    await expect(sheet.getByLabel('참여할 대회')).toHaveValue(contestId);
    await sheet
      .getByLabel('사진·동영상 선택')
      .setInputFiles({ name: 'winner.png', mimeType: 'image/png', buffer: await createTestImage() });
    await sheet.getByLabel('제목', { exact: true }).fill('우승할 웃긴 순간');
    await sheet.getByRole('checkbox', { name: /공유할 권리/ }).check();
    await sheet.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('article', { name: '우승할 웃긴 순간', exact: true })).toBeVisible();

    await page.goto(groupPath);
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    await expect(sheet.getByRole('checkbox', { name: /대회에 참여하기/ })).not.toBeChecked();
    await sheet.getByRole('checkbox', { name: /대회에 참여하기/ }).check();
    await sheet.getByLabel('참여할 대회').selectOption(contestId);
    await sheet
      .getByLabel('사진·동영상 선택')
      .setInputFiles({ name: 'entry.mp4', mimeType: 'video/mp4', buffer: await createTestVideo() });
    await sheet.getByLabel('제목', { exact: true }).fill('동영상으로도 참여');
    await sheet.getByRole('checkbox', { name: /공유할 권리/ }).check();
    await sheet.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    const entries = await productRequest<{ galleryPosts: Array<{ id: string; title: string }> }>(
      owner,
      'query($groupId:ID!,$contestId:ID!){galleryPosts(groupId:$groupId,contestId:$contestId){id title}}',
      { groupId: group.id, contestId },
    );
    expect(entries.galleryPosts).toHaveLength(2);

    const seoResponse = await request.get(`${contestPath}?utm_source=duplicate`, {
      headers: { 'User-Agent': 'Twitterbot' },
    });
    const html = await seoResponse.text();
    expect(html).toContain('우승할 웃긴 순간');
    expect(html).not.toContain('data-dgst=');
    const seo = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        canonical: d.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        ld: Array.from(d.querySelectorAll('script[type="application/ld+json"]')).map((node) =>
          JSON.parse(node.textContent ?? '{}'),
        ),
        robots: d.querySelector('meta[name="robots"]')?.getAttribute('content'),
      };
    }, html);
    expect(seo.canonical).toBe(WEB_ORIGIN + contestPath);
    expect(seo.robots).not.toContain('noindex');
    expect(seo.ld[0]['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@type': 'Event', name: title }),
        expect.objectContaining({ '@type': 'CollectionPage' }),
      ]),
    );

    const voter = await createTestUser(API_URL, { origin: WEB_ORIGIN, nickname: '대회 투표 멤버' });
    await productRequest(voter, 'mutation($groupId:ID!){requestGroupMembership(groupId:$groupId){id}}', {
      groupId: group.id,
    });
    await moveTestContest(API_URL, { origin: WEB_ORIGIN, contestId, phase: 'VOTING' });
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'contest_session',
        value: voter.slice('contest_session='.length),
        url: WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto(contestPath);
    const vote = page.getByRole('button', { name: '우승할 웃긴 순간 대회 투표', exact: true });
    await vote.click();
    await expect(vote).toHaveText('내가 투표한 참여작');
    await expect(vote).toBeDisabled();
    await expect(
      page.getByRole('button', { name: '동영상으로도 참여 대회 투표', exact: true }),
    ).toBeDisabled();
    await moveTestContest(API_URL, { origin: WEB_ORIGIN, contestId, phase: 'COMPLETED' });
    await context.clearCookies();
    await page.goto(`${groupPath}/hall-of-fame`);
    const hall = page.getByRole('article', { name: title, exact: true });
    await expect(hall.getByRole('img', { name: '우승할 웃긴 순간' })).toBeVisible();
    await expect(hall.getByText('1표', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      path: `.data/screens/${testInfo.project.name}-hall-of-fame.png`,
      fullPage: true,
    });
    await hall.getByRole('link', { name: '대회 결과 보기', exact: true }).click();
    await expect(page.getByRole('region', { name: '대회 최종 결과' })).toBeVisible();
    const hallHtml = await (
      await request.get(`${groupPath}/hall-of-fame`, { headers: { 'User-Agent': 'Twitterbot' } })
    ).text();
    expect(hallHtml).toContain('우승할 웃긴 순간');
    expect(hallHtml).toContain('application/ld+json');
    expect(hallHtml).not.toContain('data-dgst=');
    const sitemap = await (await request.get('/sitemaps/contests/0.xml')).text();
    expect(sitemap).toContain(WEB_ORIGIN + contestPath);
    expect((await request.get('/sitemaps/contests/9999999999999.xml')).status()).toBe(404);
  },
);

test(
  '그룹장이 부관리자를 임명·해제하고 관리자 양도 후 권한을 내려놓아야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, signIn }, testInfo) => {
    const owner = await signIn('운영 권한 그룹장');
    const group = await seedGroup(owner, '함께 운영하는 그룹');
    const nickname = `부관리자-${testInfo.project.name}`;
    const member = await createTestUser(API_URL, { origin: WEB_ORIGIN, nickname });
    await productRequest(member, 'mutation($groupId:ID!){requestGroupMembership(groupId:$groupId){id}}', {
      groupId: group.id,
    });
    await page.goto(`/groups/${group.id}`);
    await page.getByText('초대와 그룹 멤버', { exact: true }).click();
    await page.getByRole('button', { name: `${nickname} 부관리자 임명`, exact: true }).click();
    await expect(page.getByRole('button', { name: `${nickname} 부관리자 해제`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `${nickname} 부관리자 해제`, exact: true }).click();
    await expect(page.getByRole('button', { name: `${nickname} 부관리자 임명`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `${nickname} 부관리자 임명`, exact: true }).click();
    await page.getByRole('button', { name: `${nickname} 관리자 양도`, exact: true }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText(/나는 일반 멤버로 변경됩니다/)).toBeVisible();
    await confirm.getByRole('button', { name: '관리자 양도하기', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('button', { name: /부관리자 임명|부관리자 해제|관리자 양도/ })).toHaveCount(
      0,
    );
    await page.goto(`/groups/${group.id}/contests`);
    await expect(page.getByRole('button', { name: '대회 개최하기', exact: true })).toHaveCount(0);
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'contest_session',
        value: member.slice('contest_session='.length),
        url: WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.reload();
    await expect(page.getByRole('button', { name: '대회 개최하기', exact: true })).toBeVisible();
  },
);

test(
  '비공개 대회·명예의 전당은 익명 SEO·사이트맵에 내용을 공개하지 않아야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, request, signIn }) => {
    const owner = await signIn('비공개 대회장');
    const group = await seedGroup(owner, '숨긴 대회 그룹', 'PRIVATE');
    const now = Date.now();
    const { createGroupContest: contest } = await productRequest<{ createGroupContest: { id: string } }>(
      owner,
      'mutation($groupId:ID!,$startsAt:DateTime!,$submissionEndsAt:DateTime!,$endsAt:DateTime!){createGroupContest(groupId:$groupId,title:"비공개 대회 제목 유출 금지",startsAt:$startsAt,submissionEndsAt:$submissionEndsAt,endsAt:$endsAt){id}}',
      {
        groupId: group.id,
        startsAt: new Date(now).toISOString(),
        submissionEndsAt: new Date(now + 3_600_000).toISOString(),
        endsAt: new Date(now + 7_200_000).toISOString(),
      },
    );
    const paths = [
      `/groups/${group.id}/contests`,
      `/groups/${group.id}/hall-of-fame`,
      `/groups/${group.id}/contests/${contest.id}`,
    ];
    for (const path of paths) {
      const html = await (
        await request.get(path, { headers: { Cookie: owner, 'User-Agent': 'Twitterbot' } })
      ).text();
      const seo = await page.evaluate((html) => {
        const d = new DOMParser().parseFromString(html, 'text/html');
        return {
          robots: d.querySelector('meta[name="robots"]')?.getAttribute('content'),
          ld: d.querySelectorAll('script[type="application/ld+json"]').length,
          title: d.title,
        };
      }, html);
      expect(seo.robots).toContain('noindex');
      expect(seo.ld).toBe(0);
      expect(seo.title).not.toContain('유출 금지');
    }
    await context.clearCookies();
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
      await expect(page.getByText('비공개 대회 제목 유출 금지', { exact: true })).toHaveCount(0);
    }
    const sitemap = await (await request.get('/sitemaps/contests/0.xml')).text();
    expect(sitemap).not.toContain(contest.id);
  },
);
