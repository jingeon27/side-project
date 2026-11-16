import type { Locator, Page, Request, TestInfo } from '@playwright/test';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

// PPR 응답은 열린 스트림일 수 있어 finished 대신 준비된 tree의 재사용과 최종 폼을 확인한다.
const waitForPreparedRoute = (page: Page, path: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().headers().rsc === '1' &&
      response.request().headers()['next-router-segment-prefetch'] === '/_tree',
  );

async function navigatePreparedRoute({
  page,
  testInfo,
  path,
  activate,
  form,
}: {
  page: Page;
  testInfo: TestInfo;
  path: string;
  activate: () => Promise<void>;
  form: Locator;
}) {
  const requests: Array<{
    type: string;
    rsc: string | undefined;
    segment: string | undefined;
  }> = [];
  const handleRequest = (request: Request) => {
    if (new URL(request.url()).pathname === path)
      requests.push({
        type: request.resourceType(),
        rsc: request.headers().rsc,
        segment: request.headers()['next-router-segment-prefetch'],
      });
  };
  page.on('request', handleRequest);
  const start = performance.now();
  try {
    await activate();
    await expect(page).toHaveURL(path);
    await expect(form).toBeVisible();
    expect(requests.filter(({ type }) => type === 'document')).toHaveLength(0);
    expect(requests.filter(({ segment }) => segment === '/_tree')).toHaveLength(0);
    await testInfo.attach('prepared-navigation', {
      body: JSON.stringify({ path, clickToFormMs: performance.now() - start, requests }),
      contentType: 'application/json',
    });
  } finally {
    page.off('request', handleRequest);
  }
}

test(
  '인증된 그룹 멤버의 버튼은 현재 그룹 작성 경로를 먼저 준비하고 클릭 시 화면을 교체해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const cookie = await signIn('준비된 그룹 글쓰기');
    const group = await seedGroup(cookie, '바로 나누는 순간');
    await productRequest(
      cookie,
      'mutation($id:ID!){createPost(groupId:$id,title:"함께 보는 순간",body:"이미 게시물이 있는 그룹",linkUrl:"https://example.com/prepared",rightsConfirmed:true){id}}',
      { id: group.id },
    );
    const path = `/groups/${group.id}/write`;
    const prepared = waitForPreparedRoute(page, path);
    await page.goto(`/groups/${group.id}`);
    const response = await prepared;
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(`/groups/${group.id}`);
    const button = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(button).toBeEnabled();
    await navigatePreparedRoute({
      page,
      testInfo,
      path,
      activate: () => button.click(),
      form: page.getByRole('form', { name: '그룹에 글쓰기', exact: true }),
    });
  },
);

for (const source of ['/', '/explore'])
  test(
    `참여 그룹이 없는 ${source} 버튼은 그룹 생성 경로를 먼저 준비하고 바로 이동해야 한다`,
    { tag: ['@ios', '@desktop'] },
    async ({ page, signIn }, testInfo) => {
      await signIn('준비된 첫 그룹');
      const owner = await createTestUser(API_URL, { nickname: '탐색할 그룹장', origin: WEB_ORIGIN });
      await seedGroup(owner, '탐색할 공개 그룹');
      const path = '/groups/new';
      const prepared = waitForPreparedRoute(page, path);
      await page.goto(source);
      const response = await prepared;
      expect(response.status()).toBe(200);
      await expect(page).toHaveURL(source);
      const button = page.getByRole('button', { name: '그룹 만들기', exact: true });
      await expect(button).toBeEnabled();
      await navigatePreparedRoute({
        page,
        testInfo,
        path,
        activate: () => button.click(),
        form: page.getByRole('form', { name: '그룹 만들기', exact: true }),
      });
    },
  );

test(
  '한 그룹의 홈 작성 시트는 해당 작성 경로를 준비하고 선택 즉시 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const cookie = await signIn('준비된 시트 글쓰기');
    const group = await seedGroup(cookie, '단일 그룹 준비');
    const path = `/groups/${group.id}/write`;
    await page.goto('/');
    const prepared = waitForPreparedRoute(page, path);
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const response = await prepared;
    expect(response.status()).toBe(200);
    const sheet = page.getByRole('dialog', { name: '글쓰기', exact: true });
    await navigatePreparedRoute({
      page,
      testInfo,
      path,
      activate: () => sheet.getByRole('button', { name: '게시글 작성', exact: true }).click(),
      form: page.getByRole('form', { name: '그룹에 글쓰기', exact: true }),
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  },
);
