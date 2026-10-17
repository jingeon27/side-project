import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import type { SessionRequest } from '../auth/session.types';

@Injectable()
export class UserVisibilityService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async excluded(req: SessionRequest) {
    const demoAuthors =
      this.config.demoMode || this.config.testAuthEnabled
        ? []
        : await this.db.user.findMany({ where: { demoKey: { not: null } }, select: { id: true } });
    const excluded = demoAuthors.map((user) => user.id);
    const u = req.gfSession?.user;
    if (!u) return excluded;
    const rows = await this.db.block.findMany({ where: { OR: [{ userId: u.id }, { blockedUserId: u.id }] } });
    return [...new Set([...excluded, ...rows.map((b) => (b.userId === u.id ? b.blockedUserId : b.userId))])];
  }
}
