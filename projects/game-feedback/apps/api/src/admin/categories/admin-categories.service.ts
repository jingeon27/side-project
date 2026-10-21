import { Inject, Injectable } from '@nestjs/common';

import { requireAdmin } from '../../auth/session-access';
import type { SessionRequest } from '../../auth/session.types';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient } from '../../generated/prisma';
import type { CreateCategoryDto } from './category-input.dto';

@Injectable()
export class AdminCategoriesService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async create(req: SessionRequest, input: CreateCategoryDto) {
    const u = requireAdmin(req);
    return this.transactions.run(async (tx) => {
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
    });
  }
}
