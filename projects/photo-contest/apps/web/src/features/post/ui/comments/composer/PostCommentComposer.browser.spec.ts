import { expect, test } from '@playwright/test';

import type { PostCommentCardFragment } from '@/shared/api/generated';

import {
  COMMENT_POST,
  COMMENT_VIEWER,
  commentRow,
} from '../../../../../../test/fixtures/comment-composer.data';

for (const { label, parentId } of [
  { label: '댓글', parentId: null },
  { label: '답글', parentId: 'parent-1' },
]) {
  for (const failedQuery of ['PostComments', 'RefreshPost']) {
    test(`${label} 키보드 제출 후 ${failedQuery} 실패에도 저장한 내용을 다시 보내지 않아야 한다`, async ({
      page,
    }) => {
      const stored: PostCommentCardFragment[] = [];
      const requests: string[] = [];
      const errors: Error[] = [];
      const failed = new Set<string>();
      const queries = Promise.withResolvers<void>();
      const viewer = { ...COMMENT_VIEWER, nickname: '새 닉네임' };
      page.on('pageerror', (error) => errors.push(error));
      await page.route('**/__test__/comments', async (route) => {
        const { operationName, variables } = route.request().postDataJSON() as {
          operationName: string;
          variables: { body: string };
        };
        requests.push(operationName);
        if (operationName === 'CreatePostComment') {
          const row = { ...commentRow(variables.body, parentId), author: viewer };
          stored.push(row);
          await route.fulfill({ json: { data: { createPostComment: row } } });
          return;
        }
        await queries.promise;
        if (operationName === failedQuery && !failed.has(operationName)) {
          failed.add(operationName);
          await route.fulfill({ status: 503, json: { errors: [{ message: '조회 연결 실패' }] } });
          return;
        }
        await route.fulfill({
          json: {
            data:
              operationName === 'Me'
                ? { me: viewer }
                : operationName === 'PostComments'
                  ? { postComments: stored, postCommentCount: stored.length }
                  : { galleryPost: { ...COMMENT_POST, author: viewer, commentCount: stored.length } },
          },
        });
      });
      await page.goto(`/?example=comments${parentId ? '&reply=1' : ''}`);
      const input = page.getByRole('textbox', { name: label, exact: true });
      const submit = page.getByRole('button', { name: `${label} 올리기` });
      try {
        await input.fill('한 번만 저장할 내용');
        await submit.press('Enter');
        await expect.poll(() => requests).toEqual(['CreatePostComment', 'PostComments', 'RefreshPost']);
        await expect(input).toBeDisabled();
        await expect(page.getByText('새', { exact: true })).toBeVisible();
        expect(stored).toHaveLength(1);
      } finally {
        queries.resolve();
      }
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue('');
      if (failedQuery === 'PostComments') {
        await expect(page.getByRole('alert')).toHaveText('댓글 목록을 불러오지 못했어요.');
      }
      if (failedQuery === 'RefreshPost') {
        await expect(
          page
            .getByRole('region', { name: '알림' })
            .getByText('서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', { exact: true }),
        ).toBeVisible();
      }
      await expect(page.getByRole('status', { name: '답글 완료 횟수' })).toHaveText(parentId ? '1' : '0');
      await submit.press('Enter');
      await expect(page.getByText('댓글을 입력해 주세요.')).toBeVisible();
      await page.getByRole('button', { name: '댓글 새로고침' }).click();
      await expect(page.getByRole('listitem')).toHaveText('한 번만 저장할 내용');
      expect(requests.filter((name) => name === 'CreatePostComment')).toHaveLength(1);
      expect(stored).toHaveLength(1);
      expect(errors).toEqual([]);
    });
  }
}
