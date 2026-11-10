import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
import { PostCommentReplySection } from './PostCommentReplySection';

const viewer = { __typename: 'User' as const, id: 'viewer', nickname: '나인 사람', avatar: null };
const COMMENTS = { postId: 'post-1', parentId: null, offset: 0, limit: 24 };

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

function postComment(overrides: Partial<PostCommentCardFragment>): PostCommentCardFragment {
  return {
    __typename: 'PostComment',
    id: 'comment-1',
    parentId: null,
    replyCount: 0,
    likeCount: 0,
    likedByMe: false,
    canInteract: true,
    postId: 'post-1',
    body: '점심 메뉴가 뭐였어요?',
    createdAt: '2026-10-26T00:00:00.000Z',
    canDelete: false,
    author: { __typename: 'User', id: 'friend', nickname: '친구', avatar: null },
    ...overrides,
  };
}

const replies = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    postComment({ id: `reply-${index + 1}`, parentId: 'comment-1', body: `답글 ${index + 1}` }),
  );

/** 댓글 목록처럼 첫 페이지를 구독하고 그 안에 답글 영역을 둔다. */
function CommentList() {
  useQuery(PostCommentsDocument, { variables: COMMENTS });
  return <PostCommentReplySection parentId="comment-1" />;
}

/**
 * 요청을 기록하고 release 전까지 응답을 미룬다. 답글은 offset·limit대로 잘라 주고, 등록한 답글은 앞에 붙인다.
 * 댓글 목록 재조회는 그때의 답글 수를 담아 준다. failReplies면 첫 답글 요청은 네트워크 오류로 끝난다.
 */
async function renderSection({ canInteract = true, replyRows = replies(0), failReplies = false } = {}) {
  const source = [...replyRows];
  const sent: Array<{ name: string; parentId?: unknown; offset?: unknown }> = [];
  const pending: Array<() => void> = [];
  const parent = () => postComment({ canInteract, replyCount: source.length });
  const answer = (name: string, { parentId, offset, limit, body }: ApolloLink.Operation['variables']) => {
    if (name === 'CreatePostComment') {
      const created = postComment({ id: 'reply-new', parentId, body, author: viewer, canDelete: true });
      source.unshift(created);
      return { data: { createPostComment: created } };
    }
    if (name === 'PostComments' && parentId === null)
      return { data: { postComments: [parent()], postCommentCount: 1 } };
    if (name === 'PostComments')
      return {
        data: { postComments: source.slice(offset, offset + limit), postCommentCount: source.length },
      };
    return { data: { galleryPost: { ...POST, commentCount: 1 + source.length } } };
  };
  const server = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const name = operation.operationName ?? '';
        const { parentId, offset } = operation.variables;
        sent.push(name === 'PostComments' ? { name, parentId, offset } : { name });
        const replyRequests = sent.filter((request) => request.parentId === 'comment-1').length;
        const failed = failReplies && parentId === 'comment-1' && replyRequests === 1;
        pending.push(() => {
          if (failed) {
            sink.error(new TypeError('Failed to fetch'));
            return;
          }
          sink.next(answer(name, operation.variables));
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
    variables: COMMENTS,
    data: { postComments: [parent()], postCommentCount: 1 },
  });
  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), server]),
  });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <CommentList />
      </ApolloProvider>,
    );
  });
  return {
    user: userEvent.setup(),
    sent,
    release: () => act(async () => pending.splice(0).forEach((respond) => respond())),
  };
}

/** 답글 목록은 처음 받는 동안 Suspense로 멈추므로, 그 응답이 화면에 반영되도록 누름을 act 안에서 기다린다. */
const expand = (user: ReturnType<typeof userEvent.setup>, button: HTMLElement) =>
  act(() => user.click(button));

const replyList = () => screen.queryByRole('list', { name: '답글' });
/** 답글 행마다 원 댓글 작성자 @멘션이 붙은 본문을 읽는다. */
const replyBodies = () =>
  within(screen.getByRole('list', { name: '답글' }))
    .getAllByRole('listitem')
    .map((row) => within(row).getByText('@친구').parentElement?.textContent);

beforeEach(() => {
  vi.spyOn(toast, 'error');
});

afterEach(() => vi.restoreAllMocks());

describe('PostCommentReplySection', () => {
  it('답글 수를 담은 펼침 버튼으로 답글을 펼치고 접으며 펼침 상태를 알려야 한다', async () => {
    const { user, sent, release } = await renderSection({ replyRows: replies(2) });
    const toggle = screen.getByRole('button', { name: '답글 2개 보기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await expand(user, toggle);
    expect(toggle).toHaveAccessibleName('답글 접기');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(replyList()).not.toBeInTheDocument();
    expect(sent).toEqual([{ name: 'PostComments', parentId: 'comment-1', offset: 0 }]);

    await release();
    expect(await screen.findByRole('list', { name: '답글' })).toBeInTheDocument();
    expect(replyBodies()).toEqual(['@친구 답글 1', '@친구 답글 2']);
    // 한 페이지에 다 들어오면 더 받을 것이 없다.
    expect(screen.queryByRole('button', { name: '답글 더 보기' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('답글 2개 보기');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(replyList()).not.toBeInTheDocument();
  });

  it('답글을 더 받는 동안 받은 답글을 유지한 채 진행 중으로 알리고 마지막 페이지에서 더 보기를 없애야 한다', async () => {
    const { user, sent, release } = await renderSection({ replyRows: replies(13) });
    await expand(user, screen.getByRole('button', { name: '답글 13개 보기' }));
    await release();
    const more = await screen.findByRole('button', { name: '답글 더 보기' });
    expect(replyBodies()).toHaveLength(12);
    expect(more).not.toHaveAttribute('aria-busy');

    await user.click(more);
    await waitFor(() => expect(more).toHaveAttribute('aria-busy', 'true'));
    expect(replyBodies()).toHaveLength(12);
    // 받는 중에 다시 눌러도 같은 페이지를 또 요청하지 않는다.
    await user.click(more);

    await release();
    await waitFor(() => expect(replyBodies()).toHaveLength(13));
    expect(replyBodies().at(-1)).toBe('@친구 답글 13');
    expect(screen.queryByRole('button', { name: '답글 더 보기' })).not.toBeInTheDocument();
    expect(sent.map(({ offset }) => offset)).toEqual([0, 12]);
  });

  it('답글을 불러오지 못하면 토스트 대신 그 자리에서 알리고 다시 시도하면 답글을 보여줘야 한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user, sent, release } = await renderSection({ replyRows: replies(1), failReplies: true });
    await expand(user, screen.getByRole('button', { name: '답글 1개 보기' }));
    await release();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('불러오지 못했어요');
    expect(alert).toHaveTextContent('네트워크 연결을 확인하고 다시 시도해 주세요.');
    expect(toast.error).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));
    // 다시 받는 동안에는 재시도 버튼을 거둬 같은 요청을 겹쳐 보내지 않는다.
    expect(within(alert).queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    await release();

    await waitFor(() => expect(replyBodies()).toEqual(['@친구 답글 1']));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sent.map(({ offset }) => offset)).toEqual([0, 0]);
  });

  it('답글을 올리면 작성 칸을 닫고 댓글 목록에서 늘어난 답글 수를 받은 뒤 새 답글을 펼쳐야 한다', async () => {
    const { user, sent, release } = await renderSection();
    expect(screen.queryByRole('button', { name: /답글 \d+개 보기/ })).not.toBeInTheDocument();
    const compose = screen.getByRole('button', { name: '답글 달기' });
    expect(compose).toHaveAttribute('aria-expanded', 'false');

    await user.click(compose);
    expect(compose).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByRole('textbox', { name: '답글' }), '김치찌개요');
    await user.click(screen.getByRole('button', { name: '답글 올리기' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    await release();
    await waitFor(() => expect(sent).toHaveLength(3));
    await release();

    await waitFor(() => expect(screen.queryByRole('textbox', { name: '답글' })).not.toBeInTheDocument());
    expect(compose).toHaveAttribute('aria-expanded', 'false');
    const toggle = screen.getByRole('button', { name: '답글 접기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await release();
    await waitFor(() => expect(replyBodies()).toEqual(['@친구 김치찌개요']));
    expect(sent).toEqual([
      { name: 'CreatePostComment' },
      { name: 'PostComments', parentId: null, offset: 0 },
      { name: 'RefreshPost' },
      { name: 'PostComments', parentId: 'comment-1', offset: 0 },
    ]);
  });

  it('그룹에 가입하지 않았으면 답글 달기 없이 답글 보기만 보여줘야 한다', async () => {
    await renderSection({ canInteract: false, replyRows: replies(3) });
    expect(screen.queryByRole('button', { name: '답글 달기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '답글 3개 보기' })).toHaveAttribute('aria-expanded', 'false');
  });
});
