import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { fail } from '../common/errors';
import { phase, PHASE } from '../contest/contest.policy';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { MembershipService } from '../group/membership.service';

/** GraphQL Vote */
export interface IVoteView {
  id: string;
  contestId: string;
  submissionId: string;
}

@Injectable()
export class VoteService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
  ) {}

  /**
   * 투표 기간에만, 숨기지 않은 남의 사진에 한 표. 1인 1표는 (contestId, voterId) unique로 지키고
   * 동시에 여러 번 보내도 한 요청만 성공한다(나머지는 CONFLICT).
   */
  async castVote(viewer: IViewer, contestId: string, submissionId: string): Promise<IVoteView> {
    return this.transactions.atomic(async (tx) => {
      const { contest } = await this.membership.accessibleContest(viewer.id, contestId, { client: tx });
      if (phase(contest) !== PHASE.VOTING) fail('투표 기간이 아닙니다.');
      const submission = await (tx ?? this.db).submission.findUnique({
        where: { id: submissionId },
        select: { contestId: true, authorId: true, hidden: true },
      });
      if (!submission || submission.contestId !== contest.id || submission.hidden)
        fail('투표할 수 없는 사진입니다.');
      if (submission.authorId === viewer.id) fail('자신의 사진에는 투표할 수 없습니다.');
      const vote = await (tx ?? this.db).vote.create({
        data: { voterId: viewer.id, contestId: contest.id, submissionId },
        select: { id: true, contestId: true, submissionId: true },
      });
      await recordEvent(tx ?? this.db, {
        id: `vote:${vote.id}`,
        type: ANALYTICS_EVENT.VOTE_CAST,
        userId: viewer.id,
        properties: { contestId: contest.id, groupId: contest.groupId },
      });
      return vote;
    });
  }
}
