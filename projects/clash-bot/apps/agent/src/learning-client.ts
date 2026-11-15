import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { DEFAULT_MODEL, selectModel, type ModelId } from './model-options.ts';
import type { QwenAction } from './qwen-actions.ts';
import { QwenClient } from './qwen-client.ts';

const trainingSchema = z
  .object({
    updated: z.boolean(),
    reason: z.string().optional(),
    version: z.int().nonnegative().optional(),
    samples: z.int().nonnegative().optional(),
    before_sha256: z.string().optional(),
    after_sha256: z.string().optional(),
    probability_before: z.number().optional(),
    probability_after: z.number().optional(),
    max_kl: z.number().optional(),
  })
  .passthrough();
export type TrainingReport = z.infer<typeof trainingSchema>;
export type LearningDecisionRequest = {
  imagePath: string;
  prompt: string;
  candidates: QwenAction[];
  featurePath: string;
};
export type DecisionOutput = {
  text: string;
  elapsedMs: number;
  peakGb: number;
  behavior?: Record<string, unknown>;
};

export class LearningClient extends QwenClient {
  constructor(dataDir: string, model: ModelId = DEFAULT_MODEL) {
    const spec = selectModel(model, true);
    super(
      join(dataDir, 'qwen/.venv/bin/python'),
      fileURLToPath(new URL('./qwen/learning_worker.py', import.meta.url)),
      join(dataDir, 'qwen', spec.directory),
      [join(dataDir, 'qwen', spec.checkpoint_directory)],
    );
  }
  async choose(request: LearningDecisionRequest): Promise<DecisionOutput> {
    const response = await this.request({
      op: 'choose',
      images: [request.imagePath],
      prompt: request.prompt,
      choices: request.candidates.map((c) => c.id),
      feature_path: request.featurePath,
    });
    const choice = z.int().parse(response.choice);
    if (!request.candidates.some((c) => c.id === choice))
      throw new Error('학습 모델이 후보 밖의 행동을 반환했습니다.');
    return {
      text: JSON.stringify({ choice }),
      elapsedMs: Number(response.elapsed_ms),
      peakGb: Number(response.peak_gb),
      behavior: z.record(z.string(), z.unknown()).parse(response.behavior),
    };
  }
  async train(episode: string): Promise<TrainingReport> {
    return trainingSchema.parse(await this.request({ op: 'train', episode }, 120_000));
  }
  async trainBatch(episodes: string[]): Promise<TrainingReport> {
    return trainingSchema.parse(await this.request({ op: 'train_batch', episodes }, 120_000));
  }
  async imitate(dataset: string): Promise<TrainingReport> {
    return trainingSchema.parse(await this.request({ op: 'imitate', dataset }, 120_000));
  }
  async observe(
    images: string[],
    prompt: string,
    schema: unknown,
  ): Promise<{ text: string; elapsedMs: number }> {
    const response = await this.request({ op: 'observe', images, prompt, schema, max_tokens: 160 }, 60_000);
    return { text: z.string().parse(response.text), elapsedMs: Number(response.elapsed_ms) };
  }
  async status(): Promise<Record<string, unknown>> {
    return this.request({ op: 'status' });
  }
}
