import { join } from 'node:path';

import { z } from 'zod';

import type { QwenAction } from '../game/actions.ts';
import { JsonLineClient } from '../shared/json-lines-client.ts';
import { pythonEnvironment, pythonExecutable } from '../shared/python.ts';
import { MODEL } from './model.ts';

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
// 챔피언(v68)은 처음 계약(controller 1)으로, 학습 후보는 controller 3으로 판단한다.
// 체크포인트에 판단 계약이 없으면 처음 계약이다.
export type ControllerVersion = 1 | 3;
export const controllerVersionOf = (status: Record<string, unknown>): ControllerVersion =>
  z.union([z.literal(1), z.literal(3)]).parse(status.controller_version ?? 1);
export type LearningDecisionRequest = {
  imagePath: string;
  prompt: string;
  candidates: QwenAction[];
  featurePath: string;
  controllerVersion: ControllerVersion;
};
// 트로피가 빌리는 읽기 전용 후보 판단은 항상 controller 3이다.
export type ExternalDecisionRequest = Omit<LearningDecisionRequest, 'controllerVersion'>;
export type DecisionOutput = {
  text: string;
  elapsedMs: number;
  peakGb: number;
  behavior?: Record<string, unknown>;
};

export class LearningClient extends JsonLineClient {
  constructor(dataDir: string) {
    super(
      pythonExecutable(dataDir),
      ['-m', 'clash_bot.qwen.learning_worker'],
      join(dataDir, 'qwen', MODEL.directory),
      [join(dataDir, 'qwen', MODEL.checkpoint_directory)],
      pythonEnvironment(dataDir),
    );
  }
  async choose(request: LearningDecisionRequest): Promise<DecisionOutput> {
    const started = performance.now();
    const response = await this.request({
      op: 'choose',
      images: [request.imagePath],
      prompt: request.prompt,
      choices: request.candidates.map((c) => c.id),
      feature_path: request.featurePath,
      controller_version: request.controllerVersion,
    });
    const choice = z.int().parse(response.choice);
    if (!request.candidates.some((c) => c.id === choice))
      throw new Error('학습 모델이 후보 밖의 행동을 반환했습니다.');
    return {
      text: JSON.stringify({ choice }),
      elapsedMs: Math.round(performance.now() - started),
      peakGb: Number(response.peak_gb),
      behavior: z.record(z.string(), z.unknown()).parse(response.behavior),
    };
  }
  async chooseExternal(request: ExternalDecisionRequest, checkpoint: string): Promise<DecisionOutput> {
    const response = await this.request({
      op: 'choose_external',
      checkpoint,
      images: [request.imagePath],
      prompt: request.prompt,
      choices: request.candidates.map((candidate) => candidate.id),
      feature_path: request.featurePath,
      controller_version: 3,
    });
    const choice = z.int().parse(response.choice);
    if (!request.candidates.some((candidate) => candidate.id === choice))
      throw new Error('공유 모델이 후보 밖의 행동을 반환했습니다.');
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
  async study(dataset: string): Promise<TrainingReport> {
    return trainingSchema.parse(await this.request({ op: 'study', dataset }, 240_000));
  }
  async studyCandidate(dataset: string): Promise<TrainingReport> {
    return trainingSchema.parse(await this.request({ op: 'study', dataset, candidate: true }, 240_000));
  }
  async beginCandidate(directory: string): Promise<Record<string, unknown>> {
    return this.request({ op: 'begin_candidate', directory });
  }
  async endCandidate(): Promise<Record<string, unknown>> {
    return this.request({ op: 'end_candidate' });
  }
  async configureCandidate(): Promise<Record<string, unknown>> {
    return this.request({ op: 'configure_candidate', controller_version: 3 });
  }
  async rehearse(rounds = 4): Promise<TrainingReport> {
    return trainingSchema.parse(await this.request({ op: 'rehearse', rounds }, 240_000));
  }
  async warmup() {
    return this.request({ op: 'warmup' }, 60_000);
  }
  async promote(checkpoint: string, report: string): Promise<Record<string, unknown>> {
    return this.request({ op: 'promote', checkpoint, report });
  }
  async checkout(checkpoint: string | null): Promise<Record<string, unknown>> {
    return this.request({ op: 'checkout', checkpoint });
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
