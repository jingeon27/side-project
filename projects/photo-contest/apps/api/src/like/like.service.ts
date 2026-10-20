import { Prisma } from '../../generated/prisma';
import { recordEvent } from '../analytics/analytics-event.writer';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { MembershipService } from '../group/membership.service';
import type { ISubmissionView } from '../submission/submission.presenter';
import { SubmissionService } from '../submission/submission.service';

const FOREIGN_KEY_VIOLATION = 'P2003';

function isMissingSubmission(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === FOREIGN_KEY_VIOLATION;
}

/**
 * 좋아요는 모든 단계에서 그룹 멤버만 누를 수 있고, 수는 항상 공개한다.
 * 두 번 눌러도 (submissionId, userId) PK로 한 개만 남는다.
 */
@Injectable()
export class LikeService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly submissionService: SubmissionService,
  ) {}

  /** 자기 사진은 BAD_USER_INPUT, 숨긴 사진은 관리자가 아니면 NOT_FOUND */
  async like(viewer: IViewer, submissionId: string): Promise<ISubmissionView> {
    const access = await this.membership.accessibleSubmission(viewer.id, submissionId);
    if (access.submission.authorId === viewer.id) fail('자신의 사진에는 좋아요를 누를 수 없습니다.');
    try {
      // 이미 있으면 아무것도 하지 않는다. Serializable이 아니어야 동시 요청이 재시도 없이 모두 성공한다.
      await this.transactions.run(async (tx) => {
        const { count } = await (tx ?? this.db).like.createMany({
          data: [{ submissionId, userId: viewer.id }],
          skipDuplicates: true,
        });
        if (count === 0) return;
        // 취소 후 다시 눌러도 같은 id라 이벤트는 처음 한 번만 남는다.
        await recordEvent(tx ?? this.db, {
          id: `like:${submissionId}:${viewer.id}`,
          type: ANALYTICS_EVENT.SUBMISSION_LIKED,
          userId: viewer.id,
          properties: { submissionId, contestId: access.contest.id, groupId: access.contest.groupId },
        });
      });
    } catch (error) {
      // 확인한 직후 관리자가 사진을 지웠다.
      if (isMissingSubmission(error)) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
      throw error;
    }
    return this.submissionService.view(viewer, access);
  }

  /** 누르지 않은 사진이면 그대로 둔다. 취소는 이벤트를 남기지 않는다. */
  async unlike(viewer: IViewer, submissionId: string): Promise<ISubmissionView> {
    const access = await this.membership.accessibleSubmission(viewer.id, submissionId);
    await this.db.like.deleteMany({ where: { submissionId, userId: viewer.id } });
    return this.submissionService.view(viewer, access);
  }
}
