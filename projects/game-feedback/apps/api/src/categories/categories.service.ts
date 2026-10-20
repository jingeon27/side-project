import { PrismaClient } from '../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
@Injectable()
export class CategoriesService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  categories() {
    return this.db.category.findMany({ where: { active: true }, orderBy: { slug: 'asc' } });
  }
}
