import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import type { PostCommentCardFragment } from '@/shared/api/generated';

import { CommentComposerFixture } from '../../../../../../test/fixtures/comment-composer';
import {
  COMMENT_POST,
  COMMENT_VIEWER,
  commentRow,
  seedCommentComposer,
} from '../../../../../../test/fixtures/comment-composer.data';
import { postTypePolicies } from '../../../model/post.type-policies';

describe.each([
  { label: '댓글', parentId: null },
  { label: '답글', parentId: 'parent-1' },
])('$label 저장 후 재조회 실패', ({ label, parentId }) => {
  it.each(['PostComments', 'RefreshPost'])(
    '%s가 실패해도 저장한 초안을 지우고 재조회만 재시도해야 한다',
    async (failedQuery) => {
      const stored: PostCommentCardFragment[] = [];
      const requests: string[] = [];
      const mutation = Promise.withResolvers<void>();
      const queries = Promise.withResolvers<void>();
      const failed = new Set<string>();
      const notify = vi.fn();
      const viewer = { ...COMMENT_VIEWER, nickname: '새 닉네임' };
      const client = new ApolloClient({
        cache: new InMemoryCache({ typePolicies: postTypePolicies }),
        link: ApolloLink.from([
          createErrorToastLink(notify),
          new ApolloLink(
            (operation) =>
              new Observable((sink) => {
                const name = operation.operationName ?? '';
                requests.push(name);
                const respond = async () => {
                  if (name === 'CreatePostComment') {
                    await mutation.promise;
                    const row = { ...commentRow(String(operation.variables.body), parentId), author: viewer };
                    stored.push(row);
                    sink.next({ data: { createPostComment: row } });
                    sink.complete();
                    return;
                  }
                  await queries.promise;
                  if (name === failedQuery && !failed.has(name)) {
                    failed.add(name);
                    sink.error(new Error('조회 연결 실패'));
                    return;
                  }
                  sink.next({
                    data:
                      name === 'Me'
                        ? { me: viewer }
                        : name === 'PostComments'
                          ? { postComments: stored, postCommentCount: stored.length }
                          : { galleryPost: { ...COMMENT_POST, author: viewer, commentCount: stored.length } },
                  });
                  sink.complete();
                };
                void respond();
              }),
          ),
        ]),
      });
      seedCommentComposer(client, parentId);
      render(<CommentComposerFixture client={client} parentId={parentId} />);
      const user = userEvent.setup();
      const input = screen.getByRole('textbox', { name: label });
      const submit = screen.getByRole('button', { name: `${label} 올리기` });
      await user.type(input, '한 번만 저장할 내용');
      await user.click(submit);
      await waitFor(() => expect(requests).toEqual(['CreatePostComment']));
      expect(input).toBeDisabled();
      expect(stored).toHaveLength(0);

      await act(async () => mutation.resolve());
      try {
        await waitFor(() => expect(requests).toEqual(['CreatePostComment', 'PostComments', 'RefreshPost']));
        expect(stored).toHaveLength(1);
        expect(input).toBeDisabled();
        expect(screen.getByText('새')).toBeVisible();
      } finally {
        await act(async () => queries.resolve());
      }
      await waitFor(() => expect(input).toBeEnabled());
      expect(input).toHaveValue('');
      if (failedQuery === 'PostComments') {
        expect(screen.getByRole('alert')).toHaveTextContent('댓글 목록을 불러오지 못했어요.');
        expect(notify).not.toHaveBeenCalled();
      }
      if (failedQuery === 'RefreshPost') {
        expect(notify).toHaveBeenCalledExactlyOnceWith(
          '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
        );
      }
      expect(screen.getByRole('status', { name: '답글 완료 횟수' })).toHaveTextContent(parentId ? '1' : '0');
      await user.click(submit);
      expect(await screen.findByText('댓글을 입력해 주세요.')).toBeVisible();
      await user.click(screen.getByRole('button', { name: '댓글 새로고침' }));
      expect(await screen.findByRole('listitem')).toHaveTextContent('한 번만 저장할 내용');
      expect(requests.filter((name) => name === 'CreatePostComment')).toHaveLength(1);
      expect(stored).toHaveLength(1);
    },
  );
});
