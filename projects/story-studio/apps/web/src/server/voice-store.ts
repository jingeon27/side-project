import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dayjs from 'dayjs';
import { z } from 'zod';

import {
  trainedVoiceSchema,
  voiceDatasetSchema,
  voiceIdSchema,
  voiceNameSchema,
  voiceRunConfigSchema,
  voiceRunIdSchema,
  voiceRunSchema,
  voiceSampleSchema,
  type TTrainedVoice,
  type TVoiceRun,
  type TVoiceSample,
} from '../lib/voice-training';
import { dataPath } from './assets';
import { StudioError } from './errors';

const locks = globalThis as typeof globalThis & { storyStudioVoiceLocks?: Map<string, Promise<void>> };
const voiceLocks = locks.storyStudioVoiceLocks ?? new Map<string, Promise<void>>();
locks.storyStudioVoiceLocks = voiceLocks;
// Serialize edits and training snapshots for one voice in the local Next process.
export async function withVoiceMutation<T>(id: string, action: () => Promise<T>): Promise<T> {
  voicePath(id);
  const previous = voiceLocks.get(id) ?? Promise.resolve();
  const next = Promise.withResolvers<void>();
  voiceLocks.set(id, next.promise);
  await previous;
  try {
    return await action();
  } finally {
    next.resolve();
    if (voiceLocks.get(id) === next.promise) voiceLocks.delete(id);
  }
}

export function voicePath(id: string, ...parts: string[]) {
  if (!voiceIdSchema.safeParse(id).success) throw new StudioError('올바른 목소리 정보가 아닙니다.', 400);
  return dataPath('voices', id, ...parts);
}
export function voiceRunPath(id: string, ...parts: string[]) {
  if (!voiceRunIdSchema.safeParse(id).success) throw new StudioError('올바른 학습 작업이 아닙니다.', 400);
  return dataPath('voice-training', 'runs', id, ...parts);
}
export async function writeVoiceDocument(filename: string, value: unknown) {
  await mkdir(path.dirname(filename), { recursive: true });
  const partial = `${filename}.${randomUUID()}.partial`;
  try {
    await writeFile(partial, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await rename(partial, filename);
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined);
    throw error;
  }
}
async function document<T>(filename: string, schema: z.ZodType<T>): Promise<T> {
  try {
    return schema.parse(JSON.parse(await readFile(filename, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new StudioError('목소리 또는 학습 정보를 찾을 수 없습니다.', 404);
    throw new StudioError('저장된 목소리 정보를 읽지 못했습니다. 원본 폴더는 보존했습니다.', 500);
  }
}
async function directory(folder: string) {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
export async function getVoiceDataset(id: string) {
  const value = await document(voicePath(id, 'voice.json'), voiceDatasetSchema);
  if (value.id !== id) throw new StudioError('저장된 목소리 ID가 일치하지 않습니다.', 500);
  return value;
}
export async function listVoiceDatasets() {
  const entries = await directory(dataPath('voices'));
  const voices = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && voiceIdSchema.safeParse(entry.name).success)
      .map((entry) => getVoiceDataset(entry.name)),
  );
  return voices.sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
}
export async function createVoiceDataset(name: string) {
  const parsed = voiceNameSchema.safeParse({ name });
  if (!parsed.success) throw new StudioError('목소리 이름을 60자 이내로 입력해 주세요.', 400);
  if ((await listVoiceDatasets()).length >= 20)
    throw new StudioError('목소리는 최대 20개까지 등록할 수 있습니다.', 409);
  const voice = { id: randomUUID(), name: parsed.data.name, createdAt: dayjs().toISOString() };
  await writeVoiceDocument(voicePath(voice.id, 'voice.json'), voice);
  return voice;
}
export async function getVoiceSamples(id: string) {
  await getVoiceDataset(id);
  const entries = await directory(voicePath(id, 'samples'));
  return Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          voiceIdSchema.safeParse(entry.name.slice(0, -5)).success,
      )
      .map((entry) => document(voicePath(id, 'samples', entry.name), voiceSampleSchema)),
  );
}
export function voiceDatasetHash(samples: TVoiceSample[]) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        [...samples]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((sample) => ({
            id: sample.id,
            transcript: sample.transcript,
            contentHash: sample.contentHash,
            audioHash: sample.audioHash,
            asset: sample.asset,
          })),
      ),
    )
    .digest('hex');
}
export async function getVoiceRunConfig(id: string) {
  const config = await document(voiceRunPath(id, 'config.json'), voiceRunConfigSchema);
  if (config.id !== id) throw new StudioError('학습 작업 ID가 일치하지 않습니다.', 500);
  return config;
}
const storedRunSchema = voiceRunSchema.extend({ ownerPid: z.number().int().min(2).optional() });
export async function getVoiceRun(id: string): Promise<TVoiceRun> {
  const stored = await document(voiceRunPath(id, 'status.json'), storedRunSchema);
  if (stored.id !== id) throw new StudioError('학습 상태 ID가 일치하지 않습니다.', 500);
  if (stored.ownerPid && ['PENDING', 'RUNNING'].includes(stored.status)) {
    try {
      process.kill(stored.ownerPid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      const latest = await document(voiceRunPath(id, 'status.json'), storedRunSchema);
      if (!['PENDING', 'RUNNING'].includes(latest.status)) return voiceRunSchema.parse(latest);
      const pointer = await readFile(voiceRunPath(id, 'checkpoints', 'latest'), 'utf8').catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return '';
          throw error;
        },
      );
      const failed = voiceRunSchema.parse({
        ...latest,
        ...(/^step-\d{6}$/.test(pointer) ? { checkpoint: pointer } : {}),
        status: 'FAILED',
        error: '학습 프로세스가 종료되었습니다. 저장된 가중치부터 다시 시작할 수 있습니다.',
      });
      await writeVoiceDocument(voiceRunPath(id, 'status.json'), failed);
      return failed;
    }
  }
  return voiceRunSchema.parse(stored);
}
export async function getVoiceRuns(voiceId: string) {
  await getVoiceDataset(voiceId);
  const entries = await directory(dataPath('voice-training', 'runs'));
  const configs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && voiceRunIdSchema.safeParse(entry.name).success)
      .map((entry) => getVoiceRunConfig(entry.name)),
  );
  const selected = configs
    .filter((config) => config.voiceId === voiceId)
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
  return Promise.all(selected.map((config) => getVoiceRun(config.id)));
}
export async function assertVoiceEditable(id: string) {
  const runs = await getVoiceRuns(id);
  if (runs.some((run) => ['PENDING', 'RUNNING'].includes(run.status)))
    throw new StudioError('학습 중인 목소리입니다. 학습을 중단한 뒤 녹음을 수정해 주세요.', 409);
}
export async function listTrainedVoices(): Promise<TTrainedVoice[]> {
  const voices = await listVoiceDatasets();
  const available = await Promise.all(
    voices.map(async (voice) => {
      try {
        const current = await document(
          voicePath(voice.id, 'current.json'),
          z.object({ runId: voiceRunIdSchema }),
        );
        const run = await getVoiceRun(current.runId);
        if (run.status !== 'SUCCEEDED' || run.voiceId !== voice.id) return null;
        return trainedVoiceSchema.parse({ voiceId: voice.id, runId: run.id, name: voice.name });
      } catch (error) {
        if (error instanceof StudioError && error.status === 404) return null;
        throw error;
      }
    }),
  );
  return available.filter((voice): voice is TTrainedVoice => voice !== null);
}
export async function resolveTrainedVoice(id: string) {
  const run = await getVoiceRun(id);
  if (run.status !== 'SUCCEEDED' || !run.checkpoint)
    throw new StudioError('완료된 음성 학습 가중치가 필요합니다.', 409);
  const config = await getVoiceRunConfig(id);
  await getVoiceDataset(config.voiceId);
  return run;
}
export async function removeVoiceSample(voiceId: string, sampleId: string) {
  if (!voiceIdSchema.safeParse(sampleId).success) throw new StudioError('올바른 녹음 ID가 아닙니다.', 400);
  return withVoiceMutation(voiceId, async () => {
    await assertVoiceEditable(voiceId);
    const sample = await document(voicePath(voiceId, 'samples', `${sampleId}.json`), voiceSampleSchema);
    await rm(voicePath(voiceId, 'samples', `${sampleId}.json`));
    await rm(dataPath('assets', path.basename(sample.asset)), { force: true }).catch(() =>
      console.error('삭제한 녹음의 자산 파일을 정리하지 못했습니다.'),
    );
  });
}
