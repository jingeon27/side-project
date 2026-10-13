import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '../generated/prisma';
import { fail } from './policy';
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.$transaction(work, { isolationLevel: 'Serializable' });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034') {
            if (attempt < 3) continue;
            fail('요청이 겹쳤습니다. 다시 시도해 주세요.', 'CONFLICT');
          }
          if (error.code === 'P2002') fail('이미 제출하거나 투표했습니다.', 'CONFLICT');
        }
        throw error;
      }
    }
    return fail('요청이 겹쳤습니다. 다시 시도해 주세요.', 'CONFLICT');
  }
}
