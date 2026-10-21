import { CacheInvalidationService } from '../../cache-invalidation/cache-invalidation.service';
import { DISCOVERY_CACHE_TAG } from '@game-feedback/contracts';
import { PrismaClient } from '../../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import { requireAdmin } from '../../auth/session-access';
import type { SessionRequest } from '../../auth/session.types';
import type { CreateCategoryDto } from './category-input.dto';
@Injectable()
export class AdminCategoriesService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
  ) {}
  async create(req: SessionRequest, input: CreateCategoryDto) {
    const u = requireAdmin(req);
    return this.cache.change(
      async (tx) => {
        const c = await (tx ?? this.db).category.create({ data: input });
        await (tx ?? this.db).auditLog.create({
          data: {
            actorId: u.id,
            action: 'CREATE_CATEGORY',
            targetType: 'CATEGORY',
            targetId: c.id,
            detail: input.name,
          },
        });
        return c;
      },
      [DISCOVERY_CACHE_TAG],
    );
  }
}
