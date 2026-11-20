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
  // 시뮬레이터 챔피언을 PPO 버전과 별도인 변하지 않는 체크포인트로 가져온다.
  importPolicy(
    policy: string,
    version: number,
    behaviorSHA256: string,
    championSHA256: string,
  ): Promise<TrophySnapshot>;
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
    const reply = trophySnapshotSchema
      .extend({ type: z.literal('result') })
      .parse(await this.client.request({ op: 'initialize', seed, behaviorSHA256 }));
    return {
      checkpoint: reply.checkpoint,
      version: reply.version,
      weightsSHA256: reply.weightsSHA256,
    };
  }
  async importPolicy(policy: string, version: number, behaviorSHA256: string, championSHA256: string) {
    await this.client.ready();
    const reply = trophySnapshotSchema
      .extend({ type: z.literal('result') })
      .parse(await this.client.request({ op: 'import', policy, version, behaviorSHA256, championSHA256 }));
    return { checkpoint: reply.checkpoint, version: reply.version, weightsSHA256: reply.weightsSHA256 };
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
