import { UnitOfWork } from '../database/unit-of-work';
import { AnalyticsRepository } from './analytics.repository';
import { Injectable } from '@nestjs/common';
import { uniq } from 'es-toolkit';

import { CLEANUP_BATCH_SIZE } from '../config/limits';
import { ANALYTICS_EVENT } from './analytics-event';

// 참여자가 이만큼 이상이면 활발한 대회로 본다.
const ACTIVE_CONTEST_PARTICIPANTS = 3;

@Injectable()
export class ContestCompletionService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly transactions: UnitOfWork,
  ) {}

  /**
   * 투표가 끝난 대회마다 contest_completed를 한 번만 남긴다.
   * @returns 이번에 기록한 대회 수
   */
  async recordCompletedContests(now = new Date()): Promise<number> {
    const contests = await this.repository.findManyContest({
      where: { endsAt: { lte: now }, completionTrackedAt: null },
      select: { id: true, groupId: true, format: true },
      orderBy: { endsAt: 'asc' },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const contest of contests) {
      await this.transactions.atomic(async (tx) => {
        const [submissions, votes] =
          contest.format === 'POST'
            ? await Promise.all([
                this.repository.findManyPost(
                  { where: { contestId: contest.id, hidden: false }, select: { authorId: true } },
                  tx,
                ),
                this.repository.findManyPostContestVote(
                  { where: { contestId: contest.id, post: { hidden: false } }, select: { voterId: true } },
                  tx,
                ),
              ])
            : await Promise.all([
                this.repository.findManySubmission(
                  { where: { contestId: contest.id, hidden: false }, select: { authorId: true } },
                  tx,
                ),
                this.repository.findManyVote(
                  {
                    where: { contestId: contest.id, submission: { hidden: false } },
                    select: { voterId: true },
                  },
                  tx,
                ),
              ]);
        const participants = uniq([
          ...submissions.map((submission) => submission.authorId),
          ...votes.map((vote) => vote.voterId),
        ]).length;
        await this.repository.recordEvent(tx, {
          id: `completed:${contest.id}`,
          type: ANALYTICS_EVENT.CONTEST_COMPLETED,
          userId: null,
          properties: {
            contestId: contest.id,
            groupId: contest.groupId,
            submissions: submissions.length,
            votes: votes.length,
            participants,
            activeContest: participants >= ACTIVE_CONTEST_PARTICIPANTS,
          },
        });
        await this.repository.updateContest(
          { where: { id: contest.id }, data: { completionTrackedAt: new Date() } },
          tx,
        );
      });
    }
    return contests.length;
  }
}
