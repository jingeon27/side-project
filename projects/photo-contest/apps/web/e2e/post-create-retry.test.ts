import { createTestImage } from '@photo-contest/test-kit';

import { isStorageUpload, productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '성공 후 보존된 글쓰기 폼에 돌아오면 입력과 요청 키를 새로 시작해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('연속 작성자');
    const group = await seedGroup(cookie, '연속 작성 그룹');
    const requestIds: string[] = [];
    page.on('request', (request) => {
      if (!request.url().endsWith('/backend/graphql') || request.method() !== 'POST') return;
      const operation = request.postDataJSON();
      if (operation.operationName === 'CreatePost') requestIds.push(operation.variables.clientRequestId);
    });
    await page.goto(`/groups/${group.id}`);
    for (const title of ['첫 번째 새 글', '두 번째 새 글']) {
      await page.getByRole('button', { name: '글쓰기', exact: true }).click();
      const form = page.getByRole('form', { name: '그룹에 글쓰기', exact: true });
      await expect(form.getByLabel('제목', { exact: true })).toHaveValue('');
      await expect(form.getByLabel('첨부 링크', { exact: true })).toHaveValue('');
      await expect(form.getByRole('checkbox', { name: /공유할 권리/ })).not.toBeChecked();
      await form.getByLabel('제목', { exact: true }).fill(title);
      await form.getByLabel('첨부 링크', { exact: true }).fill('https://example.com/new-post');
      await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
      await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
      await expect(page).toHaveURL(`/groups/${group.id}`);
      await expect(
        page
          .getByRole('region', { name: '최신 게시물', exact: true })
          .getByRole('article', { name: title, exact: true }),
      ).toBeVisible();
    }
    expect(requestIds).toHaveLength(2);
    expect(new Set(requestIds).size).toBe(2);
    const result = await productRequest<{ galleryPosts: Array<{ id: string; title: string }> }>(
      cookie,
      'query($groupId:ID!){galleryPosts(groupId:$groupId){id title}}',
      { groupId: group.id },
    );
    expect(result.galleryPosts.map((post) => post.title)).toEqual(['두 번째 새 글', '첫 번째 새 글']);
    expect(new Set(result.galleryPosts.map((post) => post.id)).size).toBe(2);
  },
);

for (const scenario of ['파일 게시 실패', '응답 유실', '목록 갱신 실패'] as const) {
  test(
    `게시물 ${scenario}에도 재전송과 저장 완료를 구분해야 한다`,
    { tag: ['@ios', '@desktop'] },
    async ({ page, signIn }) => {
      const cookie = await signIn(`게시 재시도 ${scenario}`);
      const group = await seedGroup(cookie, `게시 재시도 ${scenario}`);
      await page.goto(`/groups/${group.id}/write`);
      const form = page.getByRole('form', { name: '그룹에 글쓰기', exact: true });
      await form.getByLabel('제목', { exact: true }).fill(scenario);
      await form.getByLabel('첨부 링크', { exact: true }).fill('https://example.com/retry');
      await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
      if (scenario === '파일 게시 실패') {
        await form.getByLabel('사진 또는 동영상 선택').setInputFiles({
          name: 'retry.png',
          mimeType: 'image/png',
          buffer: await createTestImage(),
        });
      }
      const uploads: string[] = [];
      const requests: Array<{ clientRequestId: string; uploadId?: string }> = [];
      const refreshes: string[] = [];
      await page.route(isStorageUpload, async (route) => {
        if (route.request().method() === 'POST') uploads.push('uploaded');
        await route.continue();
      });
      await page.route('**/backend/graphql', async (route) => {
        const operation: {
          operationName?: string;
          variables: { clientRequestId: string; uploadId?: string };
        } = route.request().postDataJSON();
        if (operation.operationName === 'CreatePost') {
          requests.push(operation.variables);
          if (requests.length === 1 && scenario !== '목록 갱신 실패') {
            if (scenario === '응답 유실') {
              const committed = await route.fetch();
              const body: { errors?: unknown[] } = await committed.json();
              expect(body.errors).toBeUndefined();
              await route.abort('failed');
              return;
            }
            await route.fulfill({
              json: { errors: [{ message: '게시 요청 실패', extensions: { code: 'UNAVAILABLE' } }] },
            });
            return;
          }
        }
        if (scenario === '목록 갱신 실패' && requests.length && operation.operationName === 'GroupContests') {
          refreshes.push('failed');
          await route.fulfill({
            json: { errors: [{ message: '목록 갱신 실패', extensions: { code: 'UNAVAILABLE' } }] },
          });
          return;
        }
        await route.continue();
      });
      const submit = form.getByRole('button', { name: '게시물 올리기', exact: true });
      await submit.click();
      if (scenario !== '목록 갱신 실패') {
        await expect(submit).toBeEnabled();
        await expect(form.getByLabel('제목', { exact: true })).toHaveValue(scenario);
        await submit.click();
        await expect.poll(() => requests.length).toBe(2);
        expect(requests[1]?.clientRequestId).toBe(requests[0]?.clientRequestId);
      }
      await expect(form).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
      const result = await productRequest<{ galleryPosts: Array<{ id: string; title: string }> }>(
        cookie,
        'query($groupId:ID!){galleryPosts(groupId:$groupId){id title}}',
        { groupId: group.id },
      );
      expect(result.galleryPosts).toHaveLength(1);
      expect(result.galleryPosts[0]?.title).toBe(scenario);
      if (scenario === '파일 게시 실패') {
        expect(uploads).toHaveLength(1);
        expect(requests[1]?.uploadId).toBe(requests[0]?.uploadId);
      }
      if (scenario === '목록 갱신 실패') {
        expect(requests).toHaveLength(1);
        await expect.poll(() => refreshes.length).toBeGreaterThan(0);
      }
    },
  );
}
