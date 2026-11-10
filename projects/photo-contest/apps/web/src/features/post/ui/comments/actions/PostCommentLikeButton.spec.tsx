import { useLayoutEffect } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useFragment } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import { PostCommentCardFragmentDoc, type PostCommentCardFragment } from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';

import { PostCommentLikeButton } from './PostCommentLikeButton';

function comment(overrides: Partial<PostCommentCardFragment> = {}): PostCommentCardFragment {
  return {
    __typename: 'PostComment',
    id: 'comment-1',
    parentId: null,
    replyCount: 0,
    likeCount: 3,
    likedByMe: false,
    canInteract: true,
    postId: 'post-1',
    body: '저도 웃었어요',
    createdAt: '2026-10-26T00:00:00.000Z',
    canDelete: false,
    author: { __typename: 'User', id: 'friend', nickname: '친구', avatar: null },
    ...overrides,
  };
}

/** 화면에 반영된 버튼 상태만 순서대로 모은다. */
const commits: string[] = [];

/** 같은 댓글을 구독해 버튼과 같은 커밋에 다시 그려지고, 그때 화면의 버튼을 읽는다. */
function CommitRecorder() {
  useFragment({ fragment: PostCommentCardFragmentDoc, from: { __typename: 'PostComment', id: 'comment-1' } });
  useLayoutEffect(() => {
    const button = document.querySelector('button[aria-pressed]');
    commits.push(`${button?.getAttribute('aria-label')} / ${button?.getAttribute('aria-pressed')}`);
  });
  return null;
}

/** 같은 상태가 연달아 반영된 경우는 하나로 본다. */
const distinctCommits = () => commits.filter((commit, index) => commit !== commits[index - 1]);

/** 좋아요 요청을 기록하고 release 전까지 응답을 미룬다. reject면 서버가 거절한 것처럼 답한다. */
async function renderButton(initial = comment(), { reject = false } = {}) {
  const sent: string[] = [];
  const pending: Array<() => void> = [];
  const answer = (name: string) => {
    if (reject) return { errors: [{ message: '삭제된 댓글입니다.', extensions: { code: 'NOT_FOUND' } }] };
    const liked = name === 'LikePostComment';
    return {
      data: {
        [liked ? 'likePostComment' : 'unlikePostComment']: {
          __typename: 'PostComment',
          id: initial.id,
          likeCount: initial.likeCount + (liked ? 1 : -1),
          likedByMe: liked,
        },
      },
    };
  };
  const server = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const name = operation.operationName ?? '';
        sent.push(name);
        pending.push(() => {
          sink.next(answer(name));
          sink.complete();
        });
      }),
  );
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: PostCommentCardFragmentDoc, data: initial });
  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), server]),
  });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <PostCommentLikeButton id={initial.id} />
        <CommitRecorder />
      </ApolloProvider>,
    );
  });
  return {
    user: userEvent.setup(),
    sent,
    release: () => act(async () => pending.splice(0).forEach((respond) => respond())),
  };
}

beforeEach(() => {
  commits.length = 0;
  vi.spyOn(toast, 'error');
});

afterEach(() => vi.restoreAllMocks());

describe('PostCommentLikeButton', () => {
  it('누르는 즉시 하트와 수를 바꾸고 응답 뒤에도 되돌아가지 않아야 한다', async () => {
    const { user, sent, release } = await renderButton();
    const button = screen.getByRole('button', { name: '댓글 좋아요 3개' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(button).toHaveAccessibleName('댓글 좋아요 4개');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    // 응답 전에 다시 눌러도 요청과 낙관적 값을 겹쳐 쌓지 않는다.
    await user.click(button);
    expect(sent).toEqual(['LikePostComment']);
    expect(button).toHaveAccessibleName('댓글 좋아요 4개');

    await release();
    expect(button).toBeEnabled();
    expect(distinctCommits()).toEqual(['댓글 좋아요 3개 / false', '댓글 좋아요 4개 / true']);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('서버가 거절하면 누르기 전의 수와 상태로 정확히 되돌리고 알린 뒤 다시 누를 수 있어야 한다', async () => {
    const { user, sent, release } = await renderButton(comment(), { reject: true });
    const button = screen.getByRole('button', { name: '댓글 좋아요 3개' });

    await user.click(button);
    expect(button).toHaveAccessibleName('댓글 좋아요 4개');
    await release();

    await waitFor(() => expect(button).toHaveAccessibleName('댓글 좋아요 3개'));
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(distinctCommits()).toEqual([
      '댓글 좋아요 3개 / false',
      '댓글 좋아요 4개 / true',
      '댓글 좋아요 3개 / false',
    ]);
    expect(toast.error).toHaveBeenCalledWith('삭제된 댓글입니다.');

    expect(button).toBeEnabled();
    await user.click(button);
    expect(button).toHaveAccessibleName('댓글 좋아요 4개');
    expect(sent).toEqual(['LikePostComment', 'LikePostComment']);
  });

  it('좋아요 취소가 거절되면 눌린 상태와 원래 수로 돌아가야 한다', async () => {
    const { user, sent, release } = await renderButton(comment({ likeCount: 1, likedByMe: true }), {
      reject: true,
    });
    const button = screen.getByRole('button', { name: '댓글 좋아요 1개' });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);
    expect(button).toHaveAccessibleName('댓글 좋아요 0개');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await release();

    await waitFor(() => expect(button).toHaveAccessibleName('댓글 좋아요 1개'));
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(sent).toEqual(['UnlikePostComment']);
    expect(distinctCommits()).toEqual([
      '댓글 좋아요 1개 / true',
      '댓글 좋아요 0개 / false',
      '댓글 좋아요 1개 / true',
    ]);
  });

  it('그룹에 가입하지 않았으면 누를 수 있는 버튼 없이 같은 이름으로 수만 보여줘야 한다', async () => {
    await renderButton(comment({ canInteract: false, likeCount: 2, likedByMe: true }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByLabelText('댓글 좋아요 2개')).toHaveTextContent('2');
  });
});
