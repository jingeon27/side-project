import type { Prisma } from '../../generated/prisma';

export const ANALYTICS_EVENT = {
  POST_VISIBILITY_CHANGED: 'post_visibility_changed',
  GROUP_CATEGORY_CREATED: 'category_created',
  POST_CATEGORY_CHANGED: 'post_category_changed',
  POST_CREATED: 'post_created',
  POST_UPDATED: 'post_updated',
  POST_LIKED: 'post_liked',
  POST_DELETED: 'post_deleted',
  COMMENT_CREATED: 'comment_created',
  COMMENT_DELETED: 'comment_deleted',
  COMMENT_LIKED: 'comment_liked',
  NOTIFICATION_READ: 'notification_read',
  GROUP_CREATED: 'group_created',
  GROUP_PROFILE_UPDATED: 'group_profile_updated',
  GROUP_JOINED: 'group_joined',
  GROUP_LEFT: 'group_left',
  GROUP_MEMBER_REMOVED: 'group_member_removed',
  GROUP_MODERATOR_CHANGED: 'group_moderator_changed',
  GROUP_OWNERSHIP_TRANSFERRED: 'group_ownership_transferred',
  CONTEST_CREATED: 'contest_created',
  SUBMISSION_CREATED: 'submission_created',
  NEXT_CONTEST_JOINED: 'next_contest_joined',
  VOTE_CAST: 'vote_cast',
  RESULT_VIEWED: 'result_viewed',
  CONTEST_COMPLETED: 'contest_completed',
  SUBMISSION_LIKED: 'submission_liked',
} as const;

export type TAnalyticsEventType = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

export interface IAnalyticsEvent {
  /** 같은 사실은 같은 id로 기록해 재시도·동시 요청에도 한 번만 남긴다. */
  id: string;
  type: TAnalyticsEventType;
  userId: string | null;
  /** 이름·설명·신고 내용 같은 PII는 넣지 않는다. ID와 집계 숫자만 */
  properties: Prisma.InputJsonObject;
}
