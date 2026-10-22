import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiResponseValidationError, createComment, getPost, listNotifications } from './index';
import { authorFixture, postFixture } from './test/fixtures';

const timestamp = '2026-10-22T00:00:00.000Z';
const rootComment = {
  id: 'comment-1',
  postId: 'post-1',
  parentId: null,
  isDeleted: false,
  body: '댓글 본문입니다.',
  author: authorFixture(),
  createdAt: timestamp,
  updatedAt: timestamp,
};
const replyComment = {
  ...rootComment,
  id: 'reply-1',
  parentId: rootComment.id,
  body: '댓글에 남긴 답글입니다.',
};
const deletedComment = {
  ...rootComment,
  id: 'deleted-comment-1',
  isDeleted: true,
  body: '',
  author: null,
};

function respond(payload: unknown) {
  const fetcher = vi.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('comment thread response validation', () => {
  it('validates reply notification destinations and keeps older notifications without a comment target', async () => {
    const notification = {
      id: 'reply-notification',
      postId: 'post-1',
      answerId: null,
      commentId: replyComment.id,
      type: 'COMMENT_REPLY',
      message: '새 답글',
      readAt: null,
      createdAt: timestamp,
    };
    const payload = { items: [notification], unreadCount: 1, nextCursor: null };
    respond(payload);
    await expect(listNotifications()).resolves.toEqual(payload);
    const legacy = { ...notification, type: 'COMMENT', commentId: undefined };
    respond({ ...payload, items: [legacy] });
    await expect(listNotifications()).resolves.toMatchObject({ items: [{ type: 'COMMENT' }] });
    respond({ ...payload, items: [{ ...notification, commentId: 42 }] });
    await expect(listNotifications()).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('preserves reply parents and anonymous deleted roots without inventing an author or body', async () => {
    const fixture = {
      ...postFixture(),
      comments: [rootComment, replyComment, deletedComment],
    };
    respond(fixture);
    expect(await getPost('post-1')).toEqual(fixture);
  });

  it.each([
    ['missing parent', { ...rootComment, parentId: undefined }],
    ['empty parent', { ...rootComment, parentId: '' }],
    ['numeric parent', { ...rootComment, parentId: 42 }],
    ['missing deletion status', { ...rootComment, isDeleted: undefined }],
    ['string deletion status', { ...rootComment, isDeleted: 'false' }],
    ['missing active author', { ...rootComment, author: null }],
    ['empty active body', { ...rootComment, body: '' }],
    ['deleted original body', { ...deletedComment, body: '삭제 전 비공개 본문' }],
    ['deleted original author', { ...deletedComment, author: authorFixture() }],
    ['deleted reply', { ...deletedComment, parentId: rootComment.id }],
  ])('rejects %s without a thread or privacy fallback', async (_name, comment) => {
    respond({ ...postFixture(), comments: [comment] });
    await expect(getPost('post-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    respond(comment);
    await expect(createComment('post-1', { body: '새 댓글입니다.' })).rejects.toBeInstanceOf(
      ApiResponseValidationError,
    );
  });

  it('sends the reply parent through the generated create endpoint with session credentials', async () => {
    const fetcher = respond(replyComment);
    expect(await createComment('post-1', { body: replyComment.body, parentId: rootComment.id })).toEqual(
      replyComment,
    );
    const [url, options] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('/api/posts/post-1/comments');
    expect(options?.method).toBe('POST');
    expect(options?.credentials).toBe('include');
    expect(JSON.parse(String(options?.body))).toEqual({
      body: replyComment.body,
      parentId: rootComment.id,
    });
  });

  it('keeps ordinary comment creation compatible with omitted and explicit null parents', async () => {
    const fetcher = respond(rootComment);
    await expect(createComment('post-1', { body: rootComment.body })).resolves.toEqual(rootComment);
    await expect(createComment('post-1', { body: rootComment.body, parentId: null })).resolves.toEqual(
      rootComment,
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ body: rootComment.body });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      body: rootComment.body,
      parentId: null,
    });
  });
});
