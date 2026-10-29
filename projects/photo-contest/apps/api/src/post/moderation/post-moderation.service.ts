import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../../analytics/analytics-event';
import { recordEvent } from '../../analytics/analytics-event.writer';
import type { IViewer } from '../../auth/session/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../../common/errors';
import { pageRange } from '../../common/validation';
import { Database } from '../../database/database.service';
import { isAdmin } from '../../group/membership/group-role';
import { MembershipService } from '../../group/membership/membership.service';

const POST_NOT_FOUND = '게시물을 찾을 수 없습니다.';

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
      const post = await tx.post.findUnique({
        where: { id: postId },
        include: { legacySubmission: { select: { hidden: true } } },
      });
      if (!post) fail(POST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
      const member = await this.membership.requireMemberOf(viewer.id, post.groupId, POST_NOT_FOUND, tx);
      if (!isAdmin(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
      // 이관된 게시물은 기존 사진의 숨김만으로도 숨겨진다. 목록과 같은 기준으로 보고 두 행을 함께 맞춘다.
      const legacyHidden = post.legacySubmission?.hidden ?? false;
      const effective = post.hidden || legacyHidden;
      const synced = post.hidden === hidden && (!post.legacySubmissionId || legacyHidden === hidden);
      if (synced) return true;
      await tx.post.update({ where: { id: postId }, data: { hidden } });
      if (post.legacySubmissionId)
        await tx.submission.update({ where: { id: post.legacySubmissionId }, data: { hidden } });
      if (effective === hidden) return true;
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
