import { FeedRepository } from './feed.repository';
import { Injectable } from '@nestjs/common';

import type { IViewer } from '../auth/session.service';
import { pageRange } from '../common/validation';
import { PAGE_SIZE_DEFAULT } from '../config/limits';
import { PHASE, phase } from '../contest/contest.policy';
import type { TPhase } from '../contest/contest.policy';
import { MembershipService } from '../group/membership.service';
import { presentSubmission, submissionInclude } from '../submission/submission.presenter';
import type { ISubmissionView } from '../submission/submission.presenter';
import { SUBMISSION_SORT, submissionOrderBy } from '../submission/submission-sort';

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
    private readonly repository: FeedRepository,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer, range: IFeedRange): Promise<IPhotoFeedItem[]> {
    const { offset, limit } = pageRange(range.offset ?? 0, range.limit ?? PAGE_SIZE_DEFAULT);
    const groupIds = await this.membership.memberGroupIds(viewer.id);
    if (!groupIds.length) return [];
    const rows = await this.repository.findManySubmission({
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
