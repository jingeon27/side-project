import { Injectable } from '@nestjs/common';

import type { IViewer } from '../auth/session/session.service';
import { pageRange } from '../common/validation';
import { PAGE_SIZE_DEFAULT } from '../config/limits';
import { PHASE, phase, type TPhase } from '../contest/contest.policy';
import { Database } from '../database/database.service';
import { MembershipService } from '../group/membership/membership.service';
import { SUBMISSION_SORT, submissionOrderBy } from '../submission/submission-sort';
import {
  presentSubmission,
  submissionInclude,
  type ISubmissionView,
} from '../submission/submission.presenter';

export interface IFeedRange {
  offset?: unknown;
  limit?: unknown;
}
interface IPhotoFeedItem {
  id: string;
  groupId: string;
  groupName: string;
  contestTitle: string;
  phase: TPhase;
  submission: ISubmissionView;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer, range: IFeedRange): Promise<IPhotoFeedItem[]> {
    const { offset, limit } = pageRange(range.offset ?? 0, range.limit ?? PAGE_SIZE_DEFAULT);
    const groupIds = await this.membership.memberGroupIds(viewer.id);
    if (!groupIds.length) return [];
    const rows = await this.db.submission.findMany({
      where: { hidden: false, contest: { groupId: { in: groupIds } } },
      include: {
        ...submissionInclude(viewer.id, false),
        contest: { include: { group: { select: { id: true, name: true } } } },
      },
      orderBy: submissionOrderBy(SUBMISSION_SORT.NEWEST),
      skip: offset,
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      groupId: row.contest.groupId,
      groupName: row.contest.group.name,
      contestTitle: row.contest.title,
      phase: phase(row.contest),
      // 홈에는 공개 사진 정보만 싣는다. 신고·관리 정보는 대회 관리 화면에서 조회한다.
      submission: presentSubmission(row, { completed: phase(row.contest) === PHASE.COMPLETED, admin: false }),
    }));
  }
}
