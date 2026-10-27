import { Inject, Injectable } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { hiddenUserIds } from './hidden-users';

@Injectable()
export class UserVisibilityService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  excluded(req: SessionRequest, client?: Prisma.TransactionClient) {
    return hiddenUserIds(client ?? this.db, this.config, req.gfSession?.user?.id);
  }
}
