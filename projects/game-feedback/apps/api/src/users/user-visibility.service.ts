import type { Prisma } from '../generated/prisma';
import { UsersRepository } from './users.repository';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import type { SessionRequest } from '../auth/session.types';

@Injectable()
export class UserVisibilityService {
  constructor(
    @Inject(UsersRepository) private readonly repository: UsersRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async excluded(req: SessionRequest, client?: Prisma.TransactionClient) {
    const demoAuthors =
      this.config.demoMode || this.config.testAuthEnabled ? [] : await this.repository.demoAuthorIds(client);
    const excluded = demoAuthors.map((user) => user.id);
    const u = req.gfSession?.user;
    if (!u) return excluded;
    const rows = await this.repository.blocksOf(u.id, client);
    return [...new Set([...excluded, ...rows.map((b) => (b.userId === u.id ? b.blockedUserId : b.userId))])];
  }
}
