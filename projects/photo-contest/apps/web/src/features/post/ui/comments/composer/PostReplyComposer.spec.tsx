import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import {
  GalleryPostCardFragmentDoc,
  MeDocument,
  PostCommentsDocument,
  PostKind,
  type GalleryPostCardFragment,
  type PostCommentCardFragment,
} from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';

import { postTypePolicies } from '../../../model/post.type-policies';
import { PostReplyComposer } from './PostReplyComposer';

const viewer = { __typename: 'User' as const, id: 'viewer', nickname: '나인 사람', avatar: null };
const REPLIES = { postId: 'post-1', parentId: 'comment-1', offset: 0, limit: 12 };

const POST: GalleryPostCardFragment = {
  __typename: 'GalleryPost',
  id: 'post-1',
  category: null,
  contestId: null,
  contest: null,
  groupId: 'group-1',
  groupName: '웃음 그룹',
  title: '점심의 순간',
  body: '',
  kind: PostKind.Photo,
  mediaUrl: '/backend/media/upload-1',
  mediaWidth: null,
  mediaHeight: null,
  linkUrl: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  likeCount: 0,
  commentCount: 1,
  likedByMe: false,
  canDelete: false,
  canModerate: false,
  canInteract: true,
  author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
};

const REPLY: PostCommentCardFragment = {
  __typename: 'PostComment',
  id: 'reply-1',
  parentId: 'comment-1',
  replyCount: 0,
  likeCount: 0,
  likedByMe: false,
  canInteract: true,
  postId: 'post-1',
  body: '맞아요 저도요',
  createdAt: '2026-10-26T00:00:00.000Z',
  canDelete: true,
  author: viewer,
};

/** 답글 영역이 펼쳐 둔 답글 목록. 등록 뒤 다시 받는 대상이다. */
function ReplyList() {
  const { data } = useQuery(PostCommentsDocument, { variables: REPLIES });
  return (
    <ul aria-label="답글">
      {data?.postComments.map((row) => (
        <li key={row.id}>{row.body}</li>
      ))}
    </ul>
  );
}

/**
 * 보낸 요청(→)과 받은 응답(←), 부모에게 알린 콜백을 한 줄로 기록한다. 응답은 release 전까지 미루고
 * 답글 등록은 처음 rejectCreate번을 서버가 거절한다.
 */
async function renderComposer({ rejectCreate = 0 } = {}) {
  const events: string[] = [];
  const sent: Array<Record<string, unknown>> = [];
  const pending: Array<() => void> = [];
  let creates = 0;
  const answer = (name: string) => {
    if (name === 'CreatePostComment' && ++creates <= rejectCreate)
      return { errors: [{ message: '삭제된 댓글입니다.', extensions: { code: 'NOT_FOUND' } }] };
    if (name === 'CreatePostComment') return { data: { createPostComment: REPLY } };
    if (name === 'PostComments') return { data: { postComments: [REPLY], postCommentCount: 1 } };
    return { data: { galleryPost: { ...POST, commentCount: 2 } } };
  };
  const server = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const name = operation.operationName ?? '';
        events.push(`→ ${name}`);
        sent.push(operation.variables);
        pending.push(() => {
          events.push(`← ${name}`);
          sink.next(answer(name));
          sink.complete();
        });
      }),
  );
  const cache = new InMemoryCache({ typePolicies: postTypePolicies });
  cache.writeQuery({
    query: MeDocument,
    data: { me: { ...viewer, needsOnboarding: false, isAnonymous: false } },
  });
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: POST });
  cache.writeQuery({
    query: PostCommentsDocument,
    variables: REPLIES,
    data: { postComments: [], postCommentCount: 0 },
  });
  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), server]),
  });
  const onCreated = vi.fn(() => events.push('onCreated'));
  const onCancel = vi.fn(() => events.push('onCancel'));
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <ReplyList />
        <PostReplyComposer postId="post-1" parentId="comment-1" onCancel={onCancel} onCreated={onCreated} />
      </ApolloProvider>,
    );
  });
  return {
    user: userEvent.setup(),
    events,
    sent,
    onCreated,
    onCancel,
    release: () => act(async () => pending.splice(0).forEach((respond) => respond())),
  };
}

const input = () => screen.getByRole('textbox', { name: '답글' });
const submit = () => screen.getByRole('button', { name: '답글 올리기' });
const cancel = () => screen.getByRole('button', { name: '답글 작성 취소' });
const replies = () => screen.queryAllByRole('listitem').map((row) => row.textContent);

beforeEach(() => {
  vi.spyOn(toast, 'error');
});

afterEach(() => vi.restoreAllMocks());

describe('PostReplyComposer', () => {
  it('올리는 동안 입력과 취소를 잠그고 답글 목록을 다시 받은 뒤에야 onCreated를 불러야 한다', async () => {
    const { user, events, sent, onCreated, release } = await renderComposer();
    await user.type(input(), '맞아요 저도요');

    await user.dblClick(submit());
    await waitFor(() => expect(events).toEqual(['→ CreatePostComment']));
    expect(sent[0]).toEqual({ postId: 'post-1', parentId: 'comment-1', body: '맞아요 저도요' });
    expect(input()).toBeDisabled();
    expect(input()).toHaveValue('맞아요 저도요');
    expect(cancel()).toBeDisabled();
    expect(submit()).toHaveAttribute('aria-busy', 'true');

    await release();
    await waitFor(() => expect(events).toContain('→ RefreshPost'));
    expect(onCreated).not.toHaveBeenCalled();
    expect(input()).toBeDisabled();

    await release();
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(events).toEqual([
      '→ CreatePostComment',
      '← CreatePostComment',
      '→ PostComments',
      '→ RefreshPost',
      '← PostComments',
      '← RefreshPost',
      'onCreated',
    ]);
    expect(replies()).toEqual(['맞아요 저도요']);
    expect(input()).toHaveValue('');
    expect(input()).toBeEnabled();
    expect(cancel()).toBeEnabled();
  });

  it('서버가 거절하면 쓴 답글과 작성 칸을 그대로 두고 다시 올릴 수 있어야 한다', async () => {
    const { user, events, sent, onCreated, onCancel, release } = await renderComposer({ rejectCreate: 1 });
    await user.type(input(), '맞아요 저도요');

    await user.click(submit());
    await waitFor(() => expect(events).toEqual(['→ CreatePostComment']));
    await release();
    await waitFor(() => expect(input()).toBeEnabled());
    expect(input()).toHaveValue('맞아요 저도요');
    expect(cancel()).toBeEnabled();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('삭제된 댓글입니다.');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(events).toEqual(['→ CreatePostComment', '← CreatePostComment']);

    await user.click(submit());
    await waitFor(() => expect(events.at(-1)).toBe('→ CreatePostComment'));
    expect(sent[1]).toEqual(sent[0]);
    await release();
    await release();
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(input()).toHaveValue('');
  });

  it('취소하면 요청 없이 onCancel만 불러야 한다', async () => {
    const { user, events, onCreated } = await renderComposer();
    await user.type(input(), '보내지 않을 답글');
    await user.click(cancel());

    expect(events).toEqual(['onCancel']);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
