import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange } from '../common/validation';
import { Database } from '../database/database.service';
import { MembershipService } from '../group/membership.service';

@Injectable()
export class PostModerationService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  async hidden(viewer: IViewer, groupId: string, offset = 0, limit = 24) {
    const range = pageRange(offset, limit);
    await this.membership.requireAdmin(viewer.id, groupId);
    return this.db.post.findMany({
      where: { groupId, OR: [{ hidden: true }, { legacySubmission: { hidden: true } }] },
      skip: range.offset,
      take: range.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async setHidden(viewer: IViewer, postId: string, hidden: boolean) {
    return this.db.atomic(async (tx) => {
      const post = await tx.post.findUnique({ where: { id: postId } });
      if (!post) fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      await this.membership.requireAdmin(viewer.id, post.groupId, tx);
      if (post.hidden === hidden) return true;
      await tx.post.update({ where: { id: postId }, data: { hidden } });
      if (post.legacySubmissionId)
        await tx.submission.update({ where: { id: post.legacySubmissionId }, data: { hidden } });
      // 숨김·해제를 반복해도 바뀐 횟수만큼 남도록 상태 변경마다 새 id를 쓴다.
      await recordEvent(tx, {
        id: `post-visibility:${postId}:${randomUUID()}`,
        type: ANALYTICS_EVENT.POST_VISIBILITY_CHANGED,
        userId: viewer.id,
        properties: { postId, groupId: post.groupId, hidden },
      });
      return true;
    });
  }
}
