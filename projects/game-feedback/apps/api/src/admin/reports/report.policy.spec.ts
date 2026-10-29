import { describe, expect, it } from 'vitest';

import { hiddenNotificationScope } from './report.policy';

describe('콘텐츠 숨김 알림 정책', () => {
  it('게시글을 숨기면 해당 게시글에 연결된 알림만 정리해야 한다', () => {
    expect(hiddenNotificationScope({ targetType: 'POST', targetId: 'post-1', hidden: true })).toEqual({
      postId: 'post-1',
    });
  });
  it('답변을 숨기면 해당 답변에 연결된 알림만 정리해야 한다', () => {
    expect(hiddenNotificationScope({ targetType: 'ANSWER', targetId: 'answer-1', hidden: true })).toEqual({
      answerId: 'answer-1',
    });
  });
  it('댓글을 숨길 때 게시글이나 답변 알림을 지우지 않아야 한다', () => {
    expect(
      hiddenNotificationScope({ targetType: 'COMMENT', targetId: 'comment-1', hidden: true }),
    ).toBeNull();
  });
  it.each(['POST', 'ANSWER', 'COMMENT'] as const)(
    '%s 숨김을 해제할 때 알림을 지우지 않아야 한다',
    (targetType) => {
      expect(hiddenNotificationScope({ targetType, targetId: 'target-1', hidden: false })).toBeNull();
    },
  );
});
