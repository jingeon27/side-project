import { Injectable } from '@nestjs/common';

import { sha256Hex } from '../common/crypto';
import { ERROR_CODE, fail } from '../common/errors';
import { isProduction } from '../config/env';
import { WRITE_RATE_LIMIT } from '../config/limits';
import { Database } from '../database/database.service';

export type TWriteAction = keyof typeof WRITE_RATE_LIMIT;

export interface IWriteActor {
  userId: string | null;
  /** `rateLimitAddress()`. 내부 웹 서버 요청이면 null이라 주소 한도를 세지 않는다. */
  address: string | null;
}

export const WRITE_RATE_LIMITED = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';

/**
 * 그룹 생성·게시·댓글·가입 신청·신고·OAuth 시작의 남용을 운영에서 사용자·주소마다 막는다.
 * 고정 창 버킷을 DB에 upsert로 세어 API 인스턴스가 여럿이어도 같은 한도를 쓴다. 만료 행은 maintenance가 지운다.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly db: Database) {}

  async consume(action: TWriteAction, actor: IWriteActor) {
    if (!isProduction()) return;
    const rule = WRITE_RATE_LIMIT[action];
    const buckets = [
      ...(actor.userId && rule.perUser ? [{ key: `user:${actor.userId}`, limit: rule.perUser }] : []),
      ...(actor.address ? [{ key: `address:${actor.address}`, limit: rule.perAddress }] : []),
    ];
    for (const bucket of buckets) {
      const count = await this.increment(`${action}:${bucket.key}`, rule.windowMs);
      if (count > bucket.limit) fail(WRITE_RATE_LIMITED, ERROR_CODE.RATE_LIMITED);
    }
  }

  private async increment(key: string, windowMs: number) {
    const window = Math.floor(Date.now() / windowMs);
    const keyHash = sha256Hex(`${key}:${window}`);
    const bucket = await this.db.rateLimitBucket.upsert({
      where: { keyHash },
      create: { keyHash, expiresAt: new Date((window + 1) * windowMs) },
      update: { count: { increment: 1 } },
    });
    return bucket.count;
  }
}
