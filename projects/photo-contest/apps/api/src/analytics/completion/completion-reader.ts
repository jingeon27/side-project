import type { CONTEST_FORMAT } from '../../contest/group-contest/group-contest.policy';
import type { TDatabaseClient } from '../../database/database.service';

export interface IContestParticipation {
  submissions: { authorId: string }[];
  votes: { voterId: string }[];
}

export interface ICompletionReader {
  read(client: TDatabaseClient, contestId: string): Promise<IContestParticipation>;
}

export type TCompletionReaders = Readonly<Record<keyof typeof CONTEST_FORMAT, ICompletionReader>>;
export const COMPLETION_READERS = Symbol('contest-completion-readers');
