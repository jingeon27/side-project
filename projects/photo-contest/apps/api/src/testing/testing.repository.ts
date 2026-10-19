import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';

@Injectable()
export class TestingRepository {
  constructor(private readonly db: Database) {}

  createUser<T extends Prisma.UserCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.create(args);
  }

  updateManyContest<T extends Prisma.ContestUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.updateMany(args);
  }

  createAppLoginTicket<T extends Prisma.AppLoginTicketCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.create(args);
  }
}
