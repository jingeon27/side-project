import { Inject, Injectable } from '@nestjs/common';
import { uniq } from 'es-toolkit';

import { CLEANUP_BATCH_SIZE } from '../../config/limits';
import { Database } from '../../database/database.service';
import { UnitOfWork } from '../../database/unit-of-work';
import { ANALYTICS_EVENT } from '../analytics-event';
import { recordEvent } from '../analytics-event.writer';
import { COMPLETION_READERS, type TCompletionReaders } from './completion-reader';

// 참여자가 이만큼 이상이면 활발한 대회로 본다.
const ACTIVE_CONTEST_PARTICIPANTS = 3;

@Injectable()
export class ContestCompletionService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    @Inject(COMPLETION_READERS) private readonly readers: TCompletionReaders,
  ) {}

  /**
   * 투표가 끝난 대회마다 contest_completed를 한 번만 남긴다.
   * @returns 이번에 기록한 대회 수
   */
  async recordCompletedContests(now = new Date()): Promise<number> {
    const contests = await this.db.contest.findMany({
      where: { endsAt: { lte: now }, completionTrackedAt: null },
      select: {
        id: true,
        groupId: true,
        format: true,
      },
      orderBy: { endsAt: 'asc' },
      take: CLEANUP_BATCH_SIZE,
    });
    for (const contest of contests) {
      await this.transactions.atomic(async (tx) => {
        // format은 DB의 문자열이다. POST 외의 기존 값은 이전 사진 집계로 처리한다.
        const format = contest.format === 'POST' ? 'POST' : 'LEGACY';
        const client = tx ?? this.db;
        const { submissions, votes } = await this.readers[format].read(client, contest.id);
        const participants = uniq([
          ...submissions.map((submission) => submission.authorId),
          ...votes.map((vote) => vote.voterId),
        ]).length;
        await recordEvent(client, {
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
        await client.contest.update({
          where: { id: contest.id },
          data: { completionTrackedAt: new Date() },
        });
      });
    }
    return contests.length;
  }
}
