import { Injectable } from '@nestjs/common';

import { sha256Hex } from '../common/crypto';
import { ERROR_CODE, fail } from '../common/errors';
import { isProduction } from '../config/env';
import { UPLOAD_ADDRESS_BUDGET, WRITE_RATE_LIMIT } from '../config/limits';
import { Database } from '../database/database.service';

export type TWriteAction = keyof typeof WRITE_RATE_LIMIT;

export interface IWriteActor {
  userId: string | null;
  /** `rateLimitAddress()`. 내부 웹 서버 요청이면 null이라 주소 한도를 세지 않는다. */
  address: string | null;
}

export const WRITE_RATE_LIMITED = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
export const UPLOAD_BUDGET_EXCEEDED =
  '이 네트워크에서 하루 동안 올릴 수 있는 용량(10GB)을 모두 썼습니다. 내일 다시 시도해 주세요.';

/** 업로드 예산은 KiB 단위로 센다. 1바이트 파일도 1로 센다. */
export function uploadBudgetUnits(byteSize: number) {
  return Math.max(Math.ceil(byteSize / 1024), 1);
}

/** 고정 창 버킷 키. 창이 바뀌면 새 키가 되고 지난 창의 행은 maintenance가 지운다. */
export function rateLimitBucket(key: string, windowMs: number, now = Date.now()) {
  const window = Math.floor(now / windowMs);
  return { keyHash: sha256Hex(`${key}:${window}`), expiresAt: new Date((window + 1) * windowMs) };
}

/**
 * 그룹 생성·게시·댓글·가입 신청·신고와 업로드 용량의 남용을 운영에서 사용자·주소마다 막는다.
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

  /**
   * 운영에서 주소마다 하루 동안 발급한 업로드 크기의 합을 센다. 익명 계정을 바꿔 가며 계정별 한도를 피하지 못하게 한다.
   * 넘으면 이번 요청분을 되돌려 더 작은 파일은 계속 올릴 수 있게 한다.
   */
  async consumeUploadBytes(address: string | null, byteSize: number) {
    if (!isProduction() || !address) return;
    const units = uploadBudgetUnits(byteSize);
    const bucket = rateLimitBucket(`UPLOAD_BYTES:address:${address}`, UPLOAD_ADDRESS_BUDGET.windowMs);
    const used = await this.add(bucket, units);
    if (used <= uploadBudgetUnits(UPLOAD_ADDRESS_BUDGET.bytes)) return;
    await this.db.rateLimitBucket.updateMany({
      where: { keyHash: bucket.keyHash },
      data: { count: { decrement: units } },
    });
    fail(UPLOAD_BUDGET_EXCEEDED, ERROR_CODE.RATE_LIMITED);
  }

  private increment(key: string, windowMs: number) {
    return this.add(rateLimitBucket(key, windowMs), 1);
  }

  private async add(bucket: { keyHash: string; expiresAt: Date }, amount: number) {
    const row = await this.db.rateLimitBucket.upsert({
      where: { keyHash: bucket.keyHash },
      create: { ...bucket, count: amount },
      update: { count: { increment: amount } },
    });
    return row.count;
  }
}
