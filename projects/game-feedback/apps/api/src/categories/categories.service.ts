import { CategoryInputSchema } from '@game-feedback/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireAdmin } from '../auth/session-access';
import { parse } from '../common/validation';

@Injectable()
export class CategoriesService {
  constructor(@Inject(PrismaClient) readonly db: PrismaClient) {}
  categories() {
    return this.db.category.findMany({ where: { active: true }, orderBy: { slug: 'asc' } });
  }
  async category(req: SessionRequest, body: unknown) {
    const u = requireAdmin(req),
      input = parse(CategoryInputSchema, body);
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
