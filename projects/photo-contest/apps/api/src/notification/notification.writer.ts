import { chunk } from 'es-toolkit';

import type { TDatabaseClient } from '../database/database.service';
import { enqueuePush } from '../push/push.writer';
import type { TNotificationType } from './notification-type';

export interface INotificationInput {
  userId: string;
  actorId?: string;
  groupId: string;
  postId?: string;
  commentId?: string;
  contestId?: string;
  joinRequestId?: string;
  type: TNotificationType;
  eventKey: string;
}

/** 본문 변경과 같은 트랜잭션에 기록하고 재시도 중복과 본인 알림을 막는다. */
export async function writeNotifications(client: TDatabaseClient, inputs: INotificationInput[]) {
  for (const data of chunk(
    inputs.filter((input) => input.userId !== input.actorId),
    250,
  )) {
    const rows = await client.notification.createManyAndReturn({ data, skipDuplicates: true });
    await enqueuePush(client, rows);
  }
}
