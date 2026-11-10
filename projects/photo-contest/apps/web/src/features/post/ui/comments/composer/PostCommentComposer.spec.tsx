import { useLayoutEffect } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useFragment, useQuery } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useWatch } from 'react-hook-form';
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

import { useCommentForm } from '../../../model/comment-form.hook';
import { postTypePolicies } from '../../../model/post.type-policies';
import { PostCommentComposer } from './PostCommentComposer';

const viewer = { __typename: 'User' as const, id: 'viewer', nickname: '나인 사람', avatar: null };
const COMMENTS = { postId: 'post-1', parentId: null, offset: 0, limit: 24 };

function galleryPost(overrides: Partial<GalleryPostCardFragment> = {}): GalleryPostCardFragment {
  return {
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
    linkUrl: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    likeCount: 0,
    commentCount: 1,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: true,
    author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
    ...overrides,
  };
}

function comment(id: string, body: string): PostCommentCardFragment {
  return {
    __typename: 'PostComment',
    id,
    parentId: null,
    replyCount: 0,
    likeCount: 0,
    likedByMe: false,
    canInteract: true,
    postId: 'post-1',
    body,
    createdAt: '2026-10-26T00:00:00.000Z',
    canDelete: true,
    author: viewer,
  };
}

const FIRST = comment('comment-1', '첫 댓글');
const CREATED = comment('comment-2', '저도 웃었어요');

/** 화면에 반영된 `입력 값 | 잠김 여부 | 목록 | 댓글 수`만 순서대로 모은다. */
const commits: string[] = [];

/** 오버레이처럼 폼과 댓글 목록을 소유하고 그 아래에 입력 칸을 둔다. */
function CommentsPanel() {
  const form = useCommentForm();
  // 폼 값·제출 상태와 목록을 구독해 입력 칸과 같은 커밋에 다시 그려지게 한다.
  useWatch({ control: form.control, name: 'body' });
  void form.formState.isSubmitting;
  const { data } = useQuery(PostCommentsDocument, { variables: COMMENTS });
  const { data: post } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: 'post-1' },
  });
  useLayoutEffect(() => {
    const input = document.querySelector('textarea');
    const rows = [...document.querySelectorAll('li')].map((row) => row.textContent).join(',');
    commits.push(`${input?.value} | ${input?.disabled ? '잠김' : '열림'} | ${rows} | ${post?.commentCount}`);
  });
  return (
    <>
      <p>댓글 {post?.commentCount}개</p>
      <ul aria-label="게시물 댓글">
        {data?.postComments.map((row) => (
          <li key={row.id}>{row.body}</li>
        ))}
      </ul>
      <PostCommentComposer postId="post-1" form={form} />
    </>
  );
}

/** 같은 상태가 연달아 반영된 경우는 하나로 본다. */
const distinctCommits = () => commits.filter((commit, index) => commit !== commits[index - 1]);

/**
 * 요청을 기록하고 release 전까지 응답을 미룬다. 댓글 등록은 처음 rejectCreate번을 서버가 거절하고,
 * 목록·게시물 재조회는 새 댓글이 들어간 결과로 답한다.
 */
async function renderPanel({ post = galleryPost(), rejectCreate = 0 } = {}) {
  const sent: Array<{ name: string; variables: Record<string, unknown> }> = [];
  const pending: Array<() => void> = [];
  let creates = 0;
  const answer = (name: string) => {
    if (name === 'CreatePostComment' && ++creates <= rejectCreate)
      return { errors: [{ message: '잠시 후 다시 남겨 주세요.', extensions: { code: 'RATE_LIMITED' } }] };
    if (name === 'CreatePostComment') return { data: { createPostComment: CREATED } };
    if (name === 'PostComments') return { data: { postComments: [CREATED, FIRST], postCommentCount: 2 } };
    return { data: { galleryPost: { ...post, commentCount: 2 } } };
  };
  const server = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const name = operation.operationName ?? '';
        sent.push({ name, variables: operation.variables });
        pending.push(() => {
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
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: post });
  cache.writeQuery({
    query: PostCommentsDocument,
    variables: COMMENTS,
    data: { postComments: [FIRST], postCommentCount: 1 },
  });
  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), server]),
  });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <CommentsPanel />
      </ApolloProvider>,
    );
  });
  return {
    user: userEvent.setup(),
    sent,
    names: () => sent.map(({ name }) => name),
    release: () => act(async () => pending.splice(0).forEach((respond) => respond())),
  };
}

const input = () => screen.getByRole('textbox', { name: '댓글' });
const submit = () => screen.getByRole('button', { name: '댓글 올리기' });
const rows = () => screen.getAllByRole('listitem').map((row) => row.textContent);

beforeEach(() => {
  commits.length = 0;
  vi.spyOn(toast, 'error');
});

afterEach(() => vi.restoreAllMocks());

describe('PostCommentComposer', () => {
  it('올리는 동안 입력을 잠그고 목록과 댓글 수를 다시 받은 뒤에야 입력을 비워야 한다', async () => {
    const { user, sent, names, release } = await renderPanel();
    await user.type(input(), '저도 웃었어요');
    expect(input()).toBeEnabled();
    commits.length = 0;

    await user.click(submit());
    await waitFor(() => expect(names()).toEqual(['CreatePostComment']));
    expect(sent[0]?.variables).toEqual({ postId: 'post-1', body: '저도 웃었어요' });
    expect(input()).toBeDisabled();
    expect(submit()).toHaveAttribute('aria-busy', 'true');

    // 등록 응답만으로는 끝내지 않고 목록·게시물 재조회를 기다린다.
    await release();
    await waitFor(() => expect(names()).toEqual(['CreatePostComment', 'PostComments', 'RefreshPost']));
    expect(input()).toHaveValue('저도 웃었어요');
    expect(input()).toBeDisabled();
    expect(rows()).toEqual(['첫 댓글']);

    await release();
    await waitFor(() => expect(input()).toHaveValue(''));
    expect(input()).toBeEnabled();
    expect(submit()).not.toHaveAttribute('aria-busy');
    expect(rows()).toEqual(['저도 웃었어요', '첫 댓글']);
    expect(screen.getByText('댓글 2개')).toBeInTheDocument();
    // 새 댓글이 보이기 전에 입력이 비거나, 이미 올라간 내용이 다시 보낼 수 있는 상태로 남지 않는다.
    expect(distinctCommits()).toEqual([
      '저도 웃었어요 | 잠김 | 첫 댓글 | 1',
      '저도 웃었어요 | 잠김 | 저도 웃었어요,첫 댓글 | 2',
      ' | 열림 | 저도 웃었어요,첫 댓글 | 2',
    ]);
  });

  it('올리는 버튼을 연달아 눌러도 요청을 한 번만 보내고 버튼에 포커스를 유지해야 한다', async () => {
    const { user, names, release } = await renderPanel();
    await user.type(input(), '저도 웃었어요');

    await user.dblClick(submit());
    await waitFor(() => expect(names()).toEqual(['CreatePostComment']));
    expect(submit()).toHaveFocus();
    expect(submit()).toHaveAttribute('aria-disabled', 'true');

    await release();
    await release();
    await waitFor(() => expect(input()).toHaveValue(''));
    expect(names()).toEqual(['CreatePostComment', 'PostComments', 'RefreshPost']);
    expect(submit()).toHaveFocus();
  });

  it('서버가 거절하면 쓴 내용을 남긴 채 알리고 다시 올리면 같은 내용으로 등록해야 한다', async () => {
    const { user, sent, names, release } = await renderPanel({ rejectCreate: 1 });
    await user.type(input(), '저도 웃었어요');
    commits.length = 0;

    await user.click(submit());
    await waitFor(() => expect(names()).toEqual(['CreatePostComment']));
    await release();
    await waitFor(() => expect(input()).toBeEnabled());
    expect(input()).toHaveValue('저도 웃었어요');
    expect(submit()).not.toHaveAttribute('aria-busy');
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('잠시 후 다시 남겨 주세요.');
    // 실패한 등록 뒤에는 목록·게시물을 다시 받지 않는다.
    expect(names()).toEqual(['CreatePostComment']);

    await user.click(submit());
    await waitFor(() => expect(names()).toEqual(['CreatePostComment', 'CreatePostComment']));
    expect(sent[1]?.variables).toEqual(sent[0]?.variables);
    await release();
    await release();
    await waitFor(() => expect(input()).toHaveValue(''));
    expect(distinctCommits()).toEqual([
      '저도 웃었어요 | 잠김 | 첫 댓글 | 1',
      '저도 웃었어요 | 열림 | 첫 댓글 | 1',
      '저도 웃었어요 | 잠김 | 첫 댓글 | 1',
      '저도 웃었어요 | 잠김 | 저도 웃었어요,첫 댓글 | 2',
      ' | 열림 | 저도 웃었어요,첫 댓글 | 2',
    ]);
  });

  it('공백만 쓰면 보내지 않고 입력 칸으로 포커스를 옮겨 오류를 알려야 한다', async () => {
    const { user, names } = await renderPanel();
    await user.type(input(), '   ');
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('댓글을 입력해 주세요.');
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(names()).toEqual([]);
  });

  it('그룹에 가입하지 않았으면 입력 칸 대신 그룹 가입 링크를 보여줘야 한다', async () => {
    await renderPanel({ post: galleryPost({ canInteract: false }) });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '그룹에 가입하고 댓글 남기기' })).toHaveAttribute(
      'href',
      '/groups/group-1',
    );
  });
});
