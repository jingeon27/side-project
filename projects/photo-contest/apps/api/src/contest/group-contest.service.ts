import { Injectable } from '@nestjs/common';
import { groupBy } from 'es-toolkit';
import { match } from 'ts-pattern';

import type { Contest, GroupMember, Prisma } from '../../generated/prisma';
import type { IViewer } from '../auth/session.service';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { siblingLoader } from '../common/batch';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { PAGE_SIZE_DEFAULT, TEXT_LIMIT } from '../config/limits';
import { UnitOfWork } from '../database/unit-of-work';
import { isAdmin } from '../group/group-role';
import { MembershipService } from '../group/membership.service';
import { presentPost } from '../post/post.presenter';
import { postInclude } from '../post/post.query';
import { contestDates, phase, PHASE } from './contest.policy';
import { ContestRepository } from './contest.repository';
import { CONTEST_FORMAT, GROUP_CONTEST_FILTER, type TGroupContestFilter } from './group-contest.policy';
import { rankResults } from './result-ranking';
import type { ICreateContestInput } from './contest.service';

function contestInclude(viewerId: string | null) {
  return {
    _count: { select: { posts: { where: { hidden: false } } } },
    postVotes: { where: { voterId: { in: viewerId ? [viewerId] : [] } }, select: { postId: true } },
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
    private readonly repository: ContestRepository,
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
    const rows = await this.repository.findManyContest({
      where: { groupId: input.groupId, format: CONTEST_FORMAT.POST, ...schedule },
      include: contestInclude(viewer?.id ?? null),
      orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
      skip: range.offset,
      take: range.limit,
    });
    return this.nodes(rows, viewer, member);
  }

  async get(viewer: IViewer | null, id: string) {
    const row = await this.repository.findUniqueContest({
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

  async create(viewer: IViewer, input: ICreateContestInput) {
    const row = await this.transactions.atomic(async (tx) => {
      await this.membership.requireAdmin(viewer.id, input.groupId, tx);
      const title = textValue(input.title, TEXT_LIMIT.CONTEST_TITLE, '대회 제목');
      const dates = contestDates(input.startsAt, input.submissionEndsAt, input.endsAt);
      const created = await this.repository.createContest(
        { data: { groupId: input.groupId, title, format: CONTEST_FORMAT.POST, ...dates } },
        tx,
      );
      await this.repository.recordEvent(tx, {
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
      const contest = await this.repository.findUniqueContest({ where: { id: contestId } }, tx);
      if (!contest || contest.format !== CONTEST_FORMAT.POST)
        fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
      await this.membership.requireMember(viewer.id, contest.groupId, tx);
      if (phase(contest) !== PHASE.VOTING) fail('투표 기간에만 투표할 수 있습니다.');
      const post = await this.repository.findUniquePost({ where: { id: postId } }, tx);
      if (!post || post.hidden || post.contestId !== contestId || post.groupId !== contest.groupId)
        fail('대회 참여 게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      if (post.authorId === viewer.id) fail('자신의 게시물에는 투표할 수 없습니다.');
      await this.repository.createPostContestVote({ data: { contestId, postId, voterId: viewer.id } }, tx);
    });
    return this.get(viewer, contestId);
  }

  async results(viewer: IViewer | null, contestId: string) {
    const contest = await this.get(viewer, contestId);
    if (contest.phase !== PHASE.COMPLETED) fail('대회가 끝난 후 결과를 확인할 수 있습니다.');
    return contest.loadResults();
  }

  publicCount() {
    return this.repository.countContest({
      where: { format: CONTEST_FORMAT.POST, group: { visibility: 'PUBLIC' } },
    });
  }

  async publicList(offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    const rows = await this.repository.findManyContest({
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
        const entries = await this.repository.findManyPost({
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
