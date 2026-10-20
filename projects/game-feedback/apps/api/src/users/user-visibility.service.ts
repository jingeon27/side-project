import { PrismaClient, type Prisma } from '../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';

@Injectable()
export class UserVisibilityService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async excluded(req: SessionRequest, client?: Prisma.TransactionClient) {
    const demoAuthors =
      this.config.demoMode || this.config.testAuthEnabled
        ? []
        : await (client ?? this.db).user.findMany({
            where: { demoKey: { not: null } },
            select: { id: true },
          });
    const excluded = demoAuthors.map((user) => user.id);
    const u = req.gfSession?.user;
    if (!u) return excluded;
    const rows = await (client ?? this.db).block.findMany({
      where: { OR: [{ userId: u.id }, { blockedUserId: u.id }] },
    });
    return [...new Set([...excluded, ...rows.map((b) => (b.userId === u.id ? b.blockedUserId : b.userId))])];
  }
}
