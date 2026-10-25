import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { match } from 'ts-pattern';

import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { PHASE, type TPhase } from '../contest/contest.policy';
import { Database } from '../database/database.service';

const STEP_MS = 60 * 60 * 1000;

@Injectable()
export class TestingService {
  constructor(private readonly db: Database) {}

  createUser(nickname: string, options: { needsOnboarding?: boolean; avatar?: string } = {}) {
    return this.db.user.create({
      data: {
        nickname,
        provider: 'testing',
        providerId: randomUUID(),
        needsOnboarding: options.needsOnboarding ?? false,
        avatar: options.avatar ?? null,
      },
      select: { id: true, nickname: true, avatar: true },
    });
  }

  async moveContest(contestId: string, phase: TPhase) {
    const offsets = match(phase)
      .with(PHASE.UPCOMING, () => [1, 2, 3] as const)
      .with(PHASE.SUBMISSION, () => [-1, 1, 2] as const)
      .with(PHASE.VOTING, () => [-2, -1, 1] as const)
      .with(PHASE.COMPLETED, () => [-3, -2, -1] as const)
      .exhaustive();
    const now = Date.now();
    const result = await this.db.contest.updateMany({
      where: { id: contestId },
      data: {
        startsAt: new Date(now + offsets[0] * STEP_MS),
        submissionEndsAt: new Date(now + offsets[1] * STEP_MS),
        endsAt: new Date(now + offsets[2] * STEP_MS),
      },
    });
    if (!result.count) fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return { contestId, phase };
  }

  /** 외부 provider의 성공 콜백만 대체한다. 웹의 PKCE 교환·세션 발급은 실제 인증 API가 처리한다. */
}
