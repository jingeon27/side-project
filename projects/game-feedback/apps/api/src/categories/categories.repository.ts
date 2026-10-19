import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findManyCategory<T extends Prisma.CategoryFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CategoryFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.category.findMany(args);
  }

  activeCategories() {
    return this.db.category.findMany({ where: { active: true }, orderBy: { slug: 'asc' } });
  }
}
