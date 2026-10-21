import { Inject, Injectable } from '@nestjs/common';

import { PrismaClient } from '../generated/prisma';

@Injectable()
export class CategoriesService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  categories() {
    return this.db.category.findMany({ where: { active: true }, orderBy: { slug: 'asc' } });
  }
}
