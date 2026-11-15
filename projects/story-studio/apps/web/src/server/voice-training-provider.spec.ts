import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createVoiceDataset, getVoiceRun, voicePath, voiceRunPath, writeVoiceDocument } from './voice-store';
import { resumeVoiceTraining, startVoiceTraining } from './voice-training-provider';

const worker = vi.hoisted(() => ({ run: vi.fn(), busy: false, ready: true }));
vi.mock('./local-worker', () => ({
  isLocalMode: () => true,
  localConfiguration: () => ({ voiceTrainingReady: worker.ready }),
  localWorkerBusy: () => worker.busy,
  runLocal: worker.run,
  stopLocalWorker: vi.fn(),
}));
const state = { directory: '' };
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'voice-training-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  worker.run.mockReset().mockResolvedValue({});
  worker.busy = false;
  worker.ready = true;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});
async function dataset() {
  const voice = await createVoiceDataset('학습할 목소리');
  const samples = [0, 1].map((index) => ({
    id: randomUUID(),
    filename: `${index}.wav`,
    transcript: '한국어 녹음 대본',
    duration: 3,
    asset: `/api/assets/${randomUUID()}.wav`,
    contentHash: 'a'.repeat(64),
    audioHash: 'b'.repeat(64),
  }));
  for (const sample of samples)
    await writeVoiceDocument(voicePath(voice.id, 'samples', `${sample.id}.json`), sample);
  return { voice, samples };
}
it('준비되지 않은 모델과 다른 GPU 작업을 학습 실행 전에 거부한다', async () => {
  const data = await dataset();
  worker.ready = false;
  await expect(startVoiceTraining(data.voice.id, 3)).rejects.toMatchObject({ status: 503 });
  worker.ready = true;
  worker.busy = true;
  await expect(startVoiceTraining(data.voice.id, 3)).rejects.toMatchObject({ status: 409 });
  expect(worker.run).not.toHaveBeenCalled();
});
it('학습 중 중복 시작을 막고 녹음이나 대본을 바꾼 뒤에는 기존 학습을 재개하지 않는다', async () => {
  const data = await dataset();
  const run = await startVoiceTraining(data.voice.id, 3);
  expect(run.total).toBe(6);
  await expect(startVoiceTraining(data.voice.id, 3)).rejects.toMatchObject({ status: 409 });
  await writeVoiceDocument(voiceRunPath(run.id, 'status.json'), {
    ...run,
    status: 'CANCELLED',
    checkpoint: 'step-000001',
  });
  const first = data.samples[0];
  expect(first).toBeDefined();
  if (!first) throw new Error('Missing fixture');
  await writeVoiceDocument(voicePath(data.voice.id, 'samples', `${first.id}.json`), {
    ...first,
    transcript: '대본이 바뀌었습니다',
  });
  await expect(resumeVoiceTraining(run.id)).rejects.toThrow('변경');
  expect(worker.run).toHaveBeenCalledTimes(1);
});
it('같은 자료와 체크포인트가 있을 때만 중단한 학습을 이어서 실행한다', async () => {
  const data = await dataset();
  const run = await startVoiceTraining(data.voice.id, 2);
  await writeVoiceDocument(voiceRunPath(run.id, 'status.json'), {
    ...run,
    status: 'CANCELLED',
    step: 1,
    checkpoint: 'step-000001',
  });
  await writeVoiceDocument(voiceRunPath(run.id, 'checkpoints', 'unused.json'), {});
  await writeFile(voiceRunPath(run.id, 'checkpoints', 'latest'), 'step-000001');
  expect(await resumeVoiceTraining(run.id)).toMatchObject({ status: 'PENDING', step: 1 });
  expect(worker.run).toHaveBeenLastCalledWith({
    action: 'train-voice',
    taskId: run.id,
    runId: run.id,
    resume: true,
  });
  expect((await getVoiceRun(run.id)).error).toBeUndefined();
});
