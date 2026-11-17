import { z } from 'zod';

import { JsonLineClient } from '../shared/json-lines-client.ts';
import { pythonEnvironment, pythonExecutable } from '../shared/python.ts';
import { trophySnapshotSchema, type TrophySnapshot } from './protocol.ts';

const updateSchema = z
  .object({
    snapshot: trophySnapshotSchema,
    report: z.object({ updated: z.boolean() }).passthrough(),
    id: z.string(),
  })
  .passthrough();
export type TrophyUpdate = z.infer<typeof updateSchema>;
export interface TrophyLearnerPort {
  initialize(seed: string, behaviorSHA256: string): Promise<TrophySnapshot>;
  train(
    policy: TrophySnapshot,
    episodes: string[],
    behaviorSHA256: string,
    championParentSHA256: string,
  ): Promise<TrophyUpdate>;
  close(): Promise<void>;
}
export class TrophyLearnerClient implements TrophyLearnerPort {
  readonly client: JsonLineClient;
  constructor(dataDir: string, root: string) {
    this.client = new JsonLineClient(
      pythonExecutable(dataDir),
      ['-m', 'clash_bot.trophy.worker'],
      root,
      [],
      pythonEnvironment(dataDir),
    );
  }
  async initialize(seed: string, behaviorSHA256: string) {
    await this.client.ready();
    return trophySnapshotSchema.parse(await this.client.request({ op: 'initialize', seed, behaviorSHA256 }));
  }
  async train(
    policy: TrophySnapshot,
    episodes: string[],
    behaviorSHA256: string,
    championParentSHA256: string,
  ) {
    await this.client.ready();
    return updateSchema.parse(
      await this.client.request(
        { op: 'train', policy, episodes, behaviorSHA256, championParentSHA256 },
        120_000,
      ),
    );
  }
  close() {
    return this.client.close();
  }
}
