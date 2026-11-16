import { Injectable } from '@nestjs/common';

import type { TDatabaseClient } from '../../database/database.service';
import type { ICompletionReader } from './completion-reader';

@Injectable()
export class LegacyCompletionReader implements ICompletionReader {
  async read(client: TDatabaseClient, contestId: string) {
    const [submissions, votes] = await Promise.all([
      client.submission.findMany({ where: { contestId, hidden: false }, select: { authorId: true } }),
      client.vote.findMany({
        where: { contestId, submission: { hidden: false } },
        select: { voterId: true },
      }),
    ]);
    return { submissions, votes };
  }
}
