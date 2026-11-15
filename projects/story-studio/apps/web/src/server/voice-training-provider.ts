import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import dayjs from 'dayjs';

import { voiceRunSchema, type TVoiceRun } from '../lib/voice-training';
import { StudioError } from './errors';
import { isLocalMode, localConfiguration, localWorkerBusy, runLocal, stopLocalWorker } from './local-worker';
import {
  assertVoiceEditable,
  getVoiceRun,
  getVoiceRunConfig,
  getVoiceSamples,
  voiceDatasetHash,
  voiceRunPath,
  withVoiceMutation,
  writeVoiceDocument,
} from './voice-store';

function requireTrainingReady() {
  if (!isLocalMode() || !localConfiguration().voiceTrainingReady)
    throw new StudioError(
      '로컬 음성 학습 모델을 먼저 준비해 주세요. 음성 학습 화면의 설치 안내를 확인해 주세요.',
      503,
    );
  if (localWorkerBusy())
    throw new StudioError('다른 로컬 모델이 실행 중입니다. 완료하거나 중단한 뒤 학습을 시작해 주세요.', 409);
}
function launch(run: TVoiceRun, resume: boolean) {
  void (async () => {
    try {
      await runLocal({ action: 'train-voice', taskId: run.id, runId: run.id, resume });
    } catch {
      try {
        const latest = await getVoiceRun(run.id);
        if (['SUCCEEDED', 'CANCELLED', 'FAILED'].includes(latest.status)) return;
        await writeVoiceDocument(voiceRunPath(run.id, 'status.json'), {
          ...latest,
          status: 'FAILED',
          error: '음성 학습이 중단되었습니다. 직전 체크포인트와 녹음은 보존했습니다.',
        });
      } catch {
        console.error('음성 학습 상태를 저장하지 못했습니다. 로컬 학습 폴더를 확인해 주세요.');
      }
    }
  })();
}
export async function startVoiceTraining(voiceId: string, epochs: number) {
  return withVoiceMutation(voiceId, () => start(voiceId, epochs));
}
async function start(voiceId: string, epochs: number) {
  requireTrainingReady();
  await assertVoiceEditable(voiceId);
  const samples = await getVoiceSamples(voiceId);
  if (samples.length < 2) throw new StudioError('학습에는 대본을 입력한 녹음이 2개 이상 필요합니다.', 400);
  const config = {
    id: `local-${randomUUID()}`,
    voiceId,
    epochs,
    sampleIds: samples.map((sample) => sample.id),
    datasetHash: voiceDatasetHash(samples),
    createdAt: dayjs().toISOString(),
  };
  const run = voiceRunSchema.parse({
    id: config.id,
    voiceId,
    status: 'PENDING',
    step: 0,
    total: samples.length * epochs,
    progress: '음성 학습 준비 중',
  });
  await writeVoiceDocument(voiceRunPath(run.id, 'config.json'), config);
  await writeVoiceDocument(voiceRunPath(run.id, 'status.json'), { ...run, ownerPid: process.pid });
  launch(run, false);
  return run;
}
export async function resumeVoiceTraining(id: string) {
  const config = await getVoiceRunConfig(id);
  return withVoiceMutation(config.voiceId, () => resume(id));
}
async function resume(id: string) {
  requireTrainingReady();
  const run = await getVoiceRun(id);
  if (!['FAILED', 'CANCELLED'].includes(run.status))
    throw new StudioError('중단되거나 실패한 학습만 이어서 실행할 수 있습니다.', 409);
  const config = await getVoiceRunConfig(id);
  await assertVoiceEditable(config.voiceId);
  if (voiceDatasetHash(await getVoiceSamples(config.voiceId)) !== config.datasetHash)
    throw new StudioError('녹음이나 대본이 변경되었습니다. 새 학습을 시작해 주세요.', 409);
  const checkpoint = await readFile(voiceRunPath(id, 'checkpoints', 'latest'), 'utf8').catch(() => '');
  if (!/^step-\d{6}$/.test(checkpoint))
    throw new StudioError('저장된 학습 가중치가 없습니다. 새 학습을 시작해 주세요.', 409);
  const pending = voiceRunSchema.parse({
    ...run,
    status: 'PENDING',
    checkpoint,
    error: undefined,
    progress: '저장된 가중치에서 학습을 재개하는 중',
  });
  await writeVoiceDocument(voiceRunPath(id, 'status.json'), { ...pending, ownerPid: process.pid });
  launch(pending, true);
  return pending;
}
export async function cancelVoiceTraining(id: string) {
  const run = await getVoiceRun(id);
  if (!['PENDING', 'RUNNING'].includes(run.status)) return run;
  await stopLocalWorker(id);
  return getVoiceRun(id);
}
