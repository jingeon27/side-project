import { describe, expect, it } from 'vitest';

import type { PostDetail } from '@/shared/api';

import { postStructuredData } from './structured-data';

describe('삭제된 원댓글이 있는 공개 글의 구조화 데이터', () => {
  it('삭제 자리표시자를 제외하고 공개 답글의 본문과 작성자만 싣는다', () => {
    const author = {
      id: 'writer',
      nickname: '플레이어',
      isVerified: false,
      isTestAccount: false,
      supercellTag: null,
    };
    const timestamp = '2026-10-22T00:00:00.000Z';
    const detail: PostDetail = {
      post: {
        id: 'post-1',
        title: '공개 글',
        body: '본문',
        categoryId: 'game',
        category: { id: 'game', slug: 'game', name: '게임', active: true },
        author,
        gameProfile: null,
        viewCount: 1,
        answerCount: 0,
        helpfulCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      answers: [],
      comments: [
        {
          id: 'deleted-root',
          postId: 'post-1',
          parentId: null,
          isDeleted: true,
          body: '',
          author: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'reply',
          postId: 'post-1',
          parentId: 'deleted-root',
          isDeleted: false,
          body: '남아 있는 답글',
          author,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      commentsCursor: null,
    };
    const data = postStructuredData(detail);
    expect(data.commentCount).toBe(1);
    expect(data.comment).toHaveLength(1);
    expect(data.comment[0]).toMatchObject({ text: '남아 있는 답글', author: { name: '플레이어' } });
  });
});
