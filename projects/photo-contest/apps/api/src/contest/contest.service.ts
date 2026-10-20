import { recordEvent } from '../analytics/analytics-event.writer';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';

import { Injectable } from '@nestjs/common';
import { groupBy, mapValues } from 'es-toolkit';

import type { Contest } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { siblingLoader } from '../common/batch';
import { fail } from '../common/errors';
import { textValue } from '../common/validation';
import { GROUP_CONTEST_HISTORY, TEXT_LIMIT } from '../config/limits';
import type { TGroupRole } from '../group/group-role';
import { isAdmin, toGroupRole } from '../group/group-role';
import { MembershipService } from '../group/membership.service';
import { SUBMISSION_SORT, submissionOrderBy } from '../submission/submission-sort';
import type { ISubmissionView } from '../submission/submission.presenter';
import { presentSubmission, submissionInclude } from '../submission/submission.presenter';
import { contestDates, phase, PHASE } from './contest.policy';
import { rankResults } from './result-ranking';

/** 조회한 사용자 기준 값. 같은 목록의 대회들과 한 번에 불러온다. */
export interface IContestViewerStats {
  mySubmissionId: string | null;
  votedSubmissionId: string | null;
  /** 숨기지 않은 사진 수 */
  submissionCount: number;
}

/** GraphQL Contest. 조회자별 필드는 필드 리졸버가 선택될 때만 계산한다. */
export interface IContestNode extends Contest {
  viewerRole: TGroupRole;
  loadViewerStats: () => Promise<IContestViewerStats>;
  /** 관리자가 아니면 빈 배열 */
  loadHiddenSubmissions: () => Promise<ISubmissionView[]>;
}

export interface ICreateContestInput {
  groupId: string;
  title: unknown;
  startsAt: unknown;
  submissionEndsAt: unknown;
  endsAt: unknown;
}

export interface IResultView {
  rank: number;
  submission: ISubmissionView;
  voteCount: number;
  winner: boolean;
}

interface IContestLoaders {
  stats: (contestId: string) => Promise<IContestViewerStats>;
  hidden: (contestId: string) => Promise<ISubmissionView[]>;
}

const EMPTY_STATS: IContestViewerStats = {
  mySubmissionId: null,
  votedSubmissionId: null,
  submissionCount: 0,
};

@Injectable()
export class ContestService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
  ) {}

  async contest(viewer: IViewer, contestId: string): Promise<IContestNode> {
    const { contest, member } = await this.membership.accessibleContest(viewer.id, contestId);
    return this.toNode(viewer.id, contest, member.role);
  }

  /** 그룹 멤버로 확인된 Group 노드 아래에서만 부른다. 최근 50개, 최신순 */
  async contestsOfGroup(viewer: IViewer, group: { id: string; role: TGroupRole }): Promise<IContestNode[]> {
    const contests = await this.db.contest.findMany({
      where: { groupId: group.id, format: 'LEGACY' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: GROUP_CONTEST_HISTORY,
    });
    return this.toNodes(viewer.id, contests, group.role);
  }

  /** 관리자만. 권한을 먼저 확인한 뒤 입력을 검사한다. */
  async createContest(viewer: IViewer, input: ICreateContestInput): Promise<IContestNode> {
    const { contest, role } = await this.transactions.atomic(async (tx) => {
      const member = await this.membership.requireAdmin(viewer.id, input.groupId, tx);
      const dates = contestDates(input.startsAt, input.submissionEndsAt, input.endsAt);
      const title = textValue(input.title, TEXT_LIMIT.CONTEST_TITLE, '대회 제목');
      const created = await (tx ?? this.db).contest.create({
        data: { groupId: input.groupId, title, ...dates },
      });
      await recordEvent(tx ?? this.db, {
        id: `contest:${created.id}`,
        type: ANALYTICS_EVENT.CONTEST_CREATED,
        userId: viewer.id,
        properties: { groupId: input.groupId, contestId: created.id },
      });
      return { contest: created, role: member.role };
    });
    return this.toNode(viewer.id, contest, role);
  }

  /** 종료된 대회만. 숨긴 사진은 빼고 득표순 경쟁 순위로 돌려준다. */
  async results(viewer: IViewer, contestId: string): Promise<IResultView[]> {
    const { contest, member } = await this.membership.accessibleContest(viewer.id, contestId);
    if (phase(contest) !== PHASE.COMPLETED) fail('대회가 끝난 후 결과를 확인할 수 있습니다.');
    const admin = isAdmin(member);
    const rows = await this.db.submission.findMany({
      where: { contestId, hidden: false },
      include: submissionInclude(viewer.id, admin),
    });
    await recordEvent(this.db, {
      id: `result:${contestId}:${viewer.id}`,
      type: ANALYTICS_EVENT.RESULT_VIEWED,
      userId: viewer.id,
      properties: { contestId, groupId: contest.groupId },
    });
    const ranked = rankResults(
      rows.map((row) => ({
        id: row.id,
        voteCount: row._count.votes,
        likeCount: row._count.likes,
        createdAt: row.createdAt,
        row,
      })),
    );
    return ranked.map(({ item, rank, winner }) => ({
      rank,
      winner,
      voteCount: item.voteCount,
      submission: presentSubmission(item.row, { completed: true, admin }),
    }));
  }

  private toNode(viewerId: string, contest: Contest, role: string): IContestNode {
    return this.node(contest, toGroupRole(role), this.loaders(viewerId, [contest]));
  }

  private toNodes(viewerId: string, contests: readonly Contest[], role: string): IContestNode[] {
    const loaders = this.loaders(viewerId, contests);
    return contests.map((contest) => this.node(contest, toGroupRole(role), loaders));
  }

  private loaders(viewerId: string, contests: readonly Contest[]): IContestLoaders {
    const ids = contests.map((contest) => contest.id);
    const completed = new Set(
      contests.filter((contest) => phase(contest) === PHASE.COMPLETED).map((contest) => contest.id),
    );
    return {
      stats: siblingLoader(ids, (keys) => this.viewerStats(viewerId, keys), EMPTY_STATS),
      hidden: siblingLoader(ids, (keys) => this.hiddenSubmissions(viewerId, keys, completed), []),
    };
  }

  private node(contest: Contest, viewerRole: TGroupRole, loaders: IContestLoaders): IContestNode {
    const admin = isAdmin({ role: viewerRole });
    return {
      ...contest,
      viewerRole,
      loadViewerStats: () => loaders.stats(contest.id),
      loadHiddenSubmissions: () => (admin ? loaders.hidden(contest.id) : Promise.resolve([])),
    };
  }

  private async viewerStats(viewerId: string, contestIds: readonly string[]) {
    const ids = [...contestIds];
    const [mine, votes, counts] = await Promise.all([
      this.db.submission.findMany({
        where: { contestId: { in: ids }, authorId: viewerId },
        select: { id: true, contestId: true },
      }),
      this.db.vote.findMany({
        where: { contestId: { in: ids }, voterId: viewerId },
        select: { contestId: true, submissionId: true },
      }),
      this.db.submission.groupBy({
        by: ['contestId'],
        where: { contestId: { in: [...ids] }, hidden: false },
        _count: { _all: true },
      }),
    ]);
    const mySubmission = new Map(mine.map((submission) => [submission.contestId, submission.id]));
    const myVote = new Map(votes.map((vote) => [vote.contestId, vote.submissionId]));
    const visibleCount = new Map(counts.map((count) => [count.contestId, count._count._all]));
    return new Map<string, IContestViewerStats>(
      ids.map((id) => [
        id,
        {
          mySubmissionId: mySubmission.get(id) ?? null,
          votedSubmissionId: myVote.get(id) ?? null,
          submissionCount: visibleCount.get(id) ?? 0,
        },
      ]),
    );
  }

  /** 관리자 노드에서만 불린다. 득표수는 종료된 대회에서만 보인다. */
  private async hiddenSubmissions(
    viewerId: string,
    contestIds: readonly string[],
    completed: ReadonlySet<string>,
  ): Promise<Map<string, ISubmissionView[]>> {
    const rows = await this.db.submission.findMany({
      where: { contestId: { in: [...contestIds] }, hidden: true },
      include: submissionInclude(viewerId, true),
      orderBy: submissionOrderBy(SUBMISSION_SORT.NEWEST),
    });
    const hiddenByContest = mapValues(
      groupBy(rows, (row) => row.contestId),
      (items, contestId) =>
        items.map((row) => presentSubmission(row, { completed: completed.has(contestId), admin: true })),
    );
    return new Map(Object.entries(hiddenByContest));
  }
}
