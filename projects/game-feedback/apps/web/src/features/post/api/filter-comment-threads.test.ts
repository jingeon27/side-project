import { describe, expect, it } from 'vitest';

import type { Comment } from '@/shared/api';

import { filterCommentThreads } from './filter-comment-threads';

describe('이전 답글이 남은 삭제 스레드의 차단 필터', () => {
  it('초기 답글이 모두 차단되어도 이전 답글을 조회할 원댓글과 커서를 남겨야 한다', () => {
    const removed: Comment = {
      id: 'removed-root',
      postId: 'post',
      parentId: null,
      replyCount: 7,
      repliesCursor: 'earlier-replies',
      isDeleted: true,
      body: '',
      author: null,
      createdAt: '2026-10-29T00:00:00Z',
      updatedAt: '2026-10-29T00:00:00Z',
    };
    const blocked: Comment = {
      ...removed,
      id: 'blocked-reply',
      parentId: removed.id,
      replyCount: 0,
      repliesCursor: null,
      isDeleted: false,
      body: '차단한 답글',
      author: {
        id: 'blocked',
        nickname: '차단한 사람',
        isVerified: false,
        isTestAccount: false,
        supercellTag: null,
      },
    };

    expect(filterCommentThreads([removed, blocked], new Set(['blocked']))).toEqual([removed]);
  });
});
