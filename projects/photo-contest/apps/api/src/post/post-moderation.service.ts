import { Injectable } from '@nestjs/common';
import type { IViewer } from '../auth/session.service';
import { Database } from '../database/database.service';
import { MembershipService } from '../group/membership.service';
import { pageRange } from '../common/validation';
import { recordEvent } from '../analytics/analytics-event.writer';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { fail, ERROR_CODE } from '../common/errors';

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
      await tx.post.update({ where: { id: postId }, data: { hidden } });
      if (post.legacySubmissionId)
        await tx.submission.update({ where: { id: post.legacySubmissionId }, data: { hidden } });
      await recordEvent(tx, {
        id: `post-visibility:${postId}:${hidden}`,
        type: ANALYTICS_EVENT.POST_VISIBILITY_CHANGED,
        userId: viewer.id,
        properties: { postId, groupId: post.groupId, hidden },
      });
      return true;
    });
  }
}
