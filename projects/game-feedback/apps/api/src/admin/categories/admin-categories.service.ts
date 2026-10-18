import type { CreateCategoryDto } from './category-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import type { SessionRequest } from '../../auth/session.types';
import { requireAdmin } from '../../auth/session-access';
@Injectable()
export class AdminCategoriesService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  async create(req: SessionRequest, input: CreateCategoryDto) {
    const u = requireAdmin(req);
    return this.db.$transaction(async (tx) => {
      const c = await tx.category.create({ data: input });
      await tx.auditLog.create({
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
