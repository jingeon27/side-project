import { describe, expect, it } from 'vitest';

import type { Comment } from '@/shared/api';

import { filterCommentThreads } from './filter-comment-threads';

function comment(id: string, authorId: string, parentId: string | null = null): Comment {
  return {
    id,
    postId: 'post-1',
    parentId,
    replyCount: 0,
    repliesCursor: null,
    isDeleted: false,
    body: '공개 댓글',
    author: { id: authorId, nickname: authorId, isVerified: false, isTestAccount: false, supercellTag: null },
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  };
}
function deleted(id: string): Comment {
  return { ...comment(id, 'removed'), isDeleted: true, body: '', author: null, parentId: null };
}

describe('댓글 스레드의 서버 차단 필터', () => {
  it('차단된 원댓글과 그 답글을 함께 빼고 다른 원댓글의 공개 답글을 유지한다', () => {
    const comments = [
      comment('blocked-root', 'blocked'),
      comment('visible-root', 'friend'),
      comment('reply-to-blocked', 'friend', 'blocked-root'),
      comment('blocked-reply', 'blocked', 'visible-root'),
      comment('visible-reply', 'reader', 'visible-root'),
    ];
    expect(filterCommentThreads(comments, new Set(['blocked'])).map((item) => item.id)).toEqual([
      'visible-root',
      'visible-reply',
    ]);
  });

  it('삭제된 익명 원댓글은 공개 답글이 있을 때만 유지하고 빈 삭제 스레드는 제거한다', () => {
    const comments = [
      deleted('deleted-parent'),
      comment('public-reply', 'friend', 'deleted-parent'),
      comment('excluded-reply', 'blocked', 'deleted-parent'),
      deleted('empty-parent'),
      comment('only-excluded-reply', 'blocked', 'empty-parent'),
    ];
    expect(filterCommentThreads(comments, new Set(['blocked'])).map((item) => item.id)).toEqual([
      'deleted-parent',
      'public-reply',
    ]);
  });

  it('부모가 숨겨졌거나 없으면 작성자가 공개인 답글도 단독으로 노출하지 않는다', () => {
    expect(filterCommentThreads([comment('orphan', 'friend', 'hidden-root')], new Set())).toEqual([]);
  });
});
