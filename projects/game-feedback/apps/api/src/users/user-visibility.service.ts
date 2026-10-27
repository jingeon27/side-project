import { Inject, Injectable } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { hiddenUserIds } from './hidden-users';

@Injectable()
export class UserVisibilityService {
  /** 한 요청의 여러 서비스(가시 글 확인 → 목록·개수)가 같은 차단 목록을 다시 읽지 않게 요청 단위로 기억한다. */
  private readonly requests = new WeakMap<
    SessionRequest,
    { viewerId: string | undefined; ids: Promise<string[]> }
  >();

  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * 트랜잭션 client를 넘기면 잠금 뒤의 최신 관계를 그 연결로 다시 읽는다(기억하지 않는다). 없으면 요청당 한 번만
   * 조회한다. 요청 도중 차단을 바꾸는 쓰기(`BlocksService`)는 이 값을 읽지 않는다.
   */
  excluded(req: SessionRequest, client?: Prisma.TransactionClient) {
    const viewerId = req.gfSession?.user?.id;
    if (client) return hiddenUserIds(client, this.config, viewerId);
    const cached = this.requests.get(req);
    // 로그인·전환으로 같은 요청의 사용자가 바뀌면 다시 읽는다.
    if (cached && cached.viewerId === viewerId) return cached.ids;
    const entry = { viewerId, ids: hiddenUserIds(this.db, this.config, viewerId) };
    this.requests.set(req, entry);
    entry.ids.catch(() => {
      if (this.requests.get(req) === entry) this.requests.delete(req);
    });
    return entry.ids;
  }
}
