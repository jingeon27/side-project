import { Injectable } from '@nestjs/common';

import type { TDatabaseClient } from '../../database/database.service';
import type { ICompletionReader } from './completion-reader';

@Injectable()
export class PostCompletionReader implements ICompletionReader {
  async read(client: TDatabaseClient, contestId: string) {
    const [submissions, votes] = await Promise.all([
      client.post.findMany({ where: { contestId, hidden: false }, select: { authorId: true } }),
      client.postContestVote.findMany({
        where: { contestId, post: { hidden: false } },
        select: { voterId: true },
      }),
    ]);
    return { submissions, votes };
  }
}
