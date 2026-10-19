import { UnitOfWork } from '../../database/unit-of-work';
import { CategoriesRepository } from './categories.repository';
import type { CreateCategoryDto } from './category-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../../auth/session.types';
import { requireAdmin } from '../../auth/session-access';
@Injectable()
export class AdminCategoriesService {
  constructor(
    @Inject(CategoriesRepository) private readonly repository: CategoriesRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async create(req: SessionRequest, input: CreateCategoryDto) {
    const u = requireAdmin(req);
    return this.transactions.run(async (tx) => {
      const c = await this.repository.createCategory({ data: input }, tx);
      await this.repository.createAuditLog(
        {
          data: {
            actorId: u.id,
            action: 'CREATE_CATEGORY',
            targetType: 'CATEGORY',
            targetId: c.id,
            detail: input.name,
          },
        },
        tx,
      );
      return c;
    });
  }
}
