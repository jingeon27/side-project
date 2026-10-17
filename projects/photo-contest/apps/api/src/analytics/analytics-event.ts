import type { Prisma } from '../../generated/prisma';
import type { TDatabaseClient } from '../database/database.service';

export const ANALYTICS_EVENT = {
  POST_CREATED: 'post_created',
  POST_LIKED: 'post_liked',
  POST_DELETED: 'post_deleted',
  COMMENT_CREATED: 'comment_created',
  COMMENT_DELETED: 'comment_deleted',
  GROUP_CREATED: 'group_created',
  GROUP_JOINED: 'group_joined',
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

/** 내부 지표용으로 DB에만 남긴다(외부 분석 도구로 보내지 않는다). 이미 있는 id면 그대로 둔다. */
export async function recordEvent(client: TDatabaseClient, event: IAnalyticsEvent) {
  await client.analyticsEvent.createMany({ data: [event], skipDuplicates: true });
}
