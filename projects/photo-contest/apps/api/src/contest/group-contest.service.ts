import { Injectable } from '@nestjs/common';
import { groupBy } from 'es-toolkit';
import { match } from 'ts-pattern';

import type { Contest, GroupMember, Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { siblingLoader } from '../common/batch';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { CONTEST_LIKE_LIMIT_MAX, PAGE_SIZE_DEFAULT, TEXT_LIMIT } from '../config/limits';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { isAdmin } from '../group/group-role';
import { MembershipService } from '../group/membership.service';
import { presentPost } from '../post/post.presenter';
import { postInclude } from '../post/post.query';
import { contestDates, phase, PHASE } from './contest.policy';
import type { ICreateContestInput } from './contest.service';
import { CONTEST_FORMAT, GROUP_CONTEST_FILTER, type TGroupContestFilter } from './group-contest.policy';
import { rankResults } from './result-ranking';

function contestInclude(viewerId: string | null) {
  return {
    _count: { select: { posts: { where: { hidden: false } } } },
    // 숨긴 작품에 던진 표는 결과에서 빠지므로 아직 투표하지 않은 것으로 보여 준다.
    postVotes: {
      where: { voterId: { in: viewerId ? [viewerId] : [] }, post: { hidden: false } },
      select: { postId: true },
    },
  } satisfies Prisma.ContestInclude;
}
type TContestRow = Prisma.ContestGetPayload<{ include: ReturnType<typeof contestInclude> }>;
export type TGroupContestResult = {
  rank: number;
  winner: boolean;
  voteCount: number;
  post: ReturnType<typeof presentPost>;
};
export interface IGroupContestNode extends Contest {
  phase: ReturnType<typeof phase>;
  isAdmin: boolean;
  canParticipate: boolean;
  canVote: boolean;
  votedPostId: string | null;
  entryCount: number;
  loadResults: () => Promise<TGroupContestResult[]>;
}

@Injectable()
export class GroupContestService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
  ) {}

  async list(
    viewer: IViewer | null,
    input: {
      groupId: string;
      filter?: TGroupContestFilter | null;
      offset?: number | null;
      limit?: number | null;
    },
  ) {
    const { member } = await this.membership.readableGroup(viewer?.id ?? null, input.groupId);
    const range = pageRange(input.offset ?? 0, input.limit ?? PAGE_SIZE_DEFAULT);
    const now = new Date();
    const schedule = match(input.filter ?? GROUP_CONTEST_FILTER.ACTIVE)
      .with(GROUP_CONTEST_FILTER.ACTIVE, () => ({ endsAt: { gt: now } }))
      .with(GROUP_CONTEST_FILTER.OPEN, () => ({ startsAt: { lte: now }, submissionEndsAt: { gt: now } }))
      .with(GROUP_CONTEST_FILTER.COMPLETED, () => ({ endsAt: { lte: now } }))
      .exhaustive();
    const rows = await this.db.contest.findMany({
      where: { groupId: input.groupId, format: CONTEST_FORMAT.POST, ...schedule },
      include: contestInclude(viewer?.id ?? null),
      orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
      skip: range.offset,
      take: range.limit,
    });
    return this.nodes(rows, viewer, member);
  }

  async get(viewer: IViewer | null, id: string) {
    const row = await this.db.contest.findUnique({
      where: { id },
      include: contestInclude(viewer?.id ?? null),
    });
    if (!row || row.format !== CONTEST_FORMAT.POST)
      fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const { member } = await this.membership.readableGroup(viewer?.id ?? null, row.groupId);
    const node = this.nodes([row], viewer, member)[0];
    if (!node) fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return node;
  }

  async create(viewer: IViewer, input: ICreateContestInput & { likeLimit?: number | null }) {
    const likeLimit = input.likeLimit ?? 1;
    if (!Number.isInteger(likeLimit) || likeLimit < 1 || likeLimit > CONTEST_LIKE_LIMIT_MAX)
      fail('1인당 좋아요 한도는 1~100개로 정해 주세요.');
    const row = await this.transactions.atomic(async (tx) => {
      await this.membership.requireAdmin(viewer.id, input.groupId, tx);
      const title = textValue(input.title, TEXT_LIMIT.CONTEST_TITLE, '대회 제목');
      const dates = contestDates(input.startsAt, input.submissionEndsAt, input.endsAt);
      const created = await (tx ?? this.db).contest.create({
        data: { groupId: input.groupId, title, likeLimit, format: CONTEST_FORMAT.POST, ...dates },
      });
      await recordEvent(tx ?? this.db, {
        id: `contest:${created.id}`,
        type: ANALYTICS_EVENT.CONTEST_CREATED,
        userId: viewer.id,
        properties: { groupId: input.groupId, contestId: created.id },
      });
      return created;
    });
    return this.get(viewer, row.id);
  }

  async vote(viewer: IViewer, contestId: string, postId: string) {
    await this.transactions.atomic(async (tx) => {
      const contest = await (tx ?? this.db).contest.findUnique({ where: { id: contestId } });
      if (!contest || contest.format !== CONTEST_FORMAT.POST)
        fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
      await this.membership.requireMember(viewer.id, contest.groupId, tx);
      if (phase(contest) !== PHASE.VOTING) fail('투표 기간에만 투표할 수 있습니다.');
      const post = await (tx ?? this.db).post.findUnique({ where: { id: postId } });
      if (!post || post.hidden || post.contestId !== contestId || post.groupId !== contest.groupId)
        fail('대회 참여 게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      if (post.authorId === viewer.id) fail('자신의 게시물에는 투표할 수 없습니다.');
      // 숨긴 작품에 던진 표는 결과에서 빠진다. 그 표에 묶여 다시 투표하지 못하는 일이 없도록 새 표로 바꾼다.
      await (tx ?? this.db).postContestVote.deleteMany({
        where: { contestId, voterId: viewer.id, post: { hidden: true } },
      });
      const vote = await (tx ?? this.db).postContestVote.create({
        data: { contestId, postId, voterId: viewer.id },
      });
      await recordEvent(tx ?? this.db, {
        id: `post-vote:${vote.id}`,
        type: ANALYTICS_EVENT.VOTE_CAST,
        userId: viewer.id,
        properties: { contestId, postId },
      });
    });
    return this.get(viewer, contestId);
  }

  async results(viewer: IViewer | null, contestId: string) {
    const contest = await this.get(viewer, contestId);
    if (contest.phase !== PHASE.COMPLETED) fail('대회가 끝난 후 결과를 확인할 수 있습니다.');
    return contest.loadResults();
  }

  publicCount() {
    return this.db.contest.count({
      where: { format: CONTEST_FORMAT.POST, group: { visibility: 'PUBLIC' } },
    });
  }

  async publicList(offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    const rows = await this.db.contest.findMany({
      where: { format: CONTEST_FORMAT.POST, group: { visibility: 'PUBLIC' } },
      include: contestInclude(null),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: range.offset,
      take: range.limit,
    });
    return this.nodes(rows, null, null);
  }

  private nodes(rows: TContestRow[], viewer: IViewer | null, member: GroupMember | null) {
    const loadResults = siblingLoader(
      rows.filter((row) => phase(row) === PHASE.COMPLETED).map((row) => row.id),
      async (ids) => {
        const entries = await this.db.post.findMany({
          where: { contestId: { in: [...ids] }, hidden: false },
          include: postInclude(viewer?.id ?? null),
        });
        const grouped = groupBy(entries, (entry) => entry.contestId ?? '');
        return new Map(
          Object.entries(grouped).map(([id, posts]) => [
            id,
            rankResults(
              posts.map((post) => ({
                id: post.id,
                voteCount: post._count.contestVotes,
                likeCount: 0,
                createdAt: post.createdAt,
                post,
              })),
            ).map(({ item, rank, winner }) => ({
              rank,
              winner,
              voteCount: item.voteCount,
              post: presentPost(item.post, viewer?.id ?? null),
            })),
          ]),
        );
      },
      [] as TGroupContestResult[],
    );
    return rows.map((row): IGroupContestNode => {
      const currentPhase = phase(row);
      return {
        ...row,
        phase: currentPhase,
        isAdmin: Boolean(member && isAdmin(member)),
        canParticipate: Boolean(member) && currentPhase === PHASE.SUBMISSION,
        canVote: Boolean(member) && currentPhase === PHASE.VOTING && !row.postVotes.length,
        votedPostId: row.postVotes[0]?.postId ?? null,
        entryCount: row._count.posts,
        loadResults: () => (currentPhase === PHASE.COMPLETED ? loadResults(row.id) : Promise.resolve([])),
      };
    });
  }
}
