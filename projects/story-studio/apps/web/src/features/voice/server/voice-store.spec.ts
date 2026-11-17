import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import dayjs from 'dayjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createVoiceDataset,
  getVoiceDataset,
  getVoiceRun,
  listTrainedVoices,
  resolveTrainedVoice,
  voiceDatasetHash,
  voicePath,
  voiceRunPath,
  withVoiceMutation,
  writeVoiceDocument,
} from './voice-store';

const state = { directory: '' };
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'voice-store-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});

it('경로 ID를 검증하고 손상된 저장 정보를 빈 목록으로 숨기지 않는다', async () => {
  expect(() => voicePath('../assets')).toThrow('올바른');
  const voice = await createVoiceDataset(' 한국어 내레이션 ');
  expect((await getVoiceDataset(voice.id)).name).toBe('한국어 내레이션');
  await writeVoiceDocument(voicePath(voice.id, 'voice.json'), { ...voice, name: '' });
  await expect(getVoiceDataset(voice.id)).rejects.toMatchObject({ status: 500 });
  expect(await readFile(voicePath(voice.id, 'voice.json'), 'utf8')).toContain(voice.id);
});

it('서버가 종료된 학습은 실패로 복구하고 원자적으로 저장한 최신 체크포인트를 보존한다', async () => {
  const voice = await createVoiceDataset('복구 검증');
  const id = `local-${randomUUID()}`;
  await writeVoiceDocument(voiceRunPath(id, 'status.json'), {
    id,
    voiceId: voice.id,
    status: 'RUNNING',
    step: 0,
    total: 6,
    ownerPid: 12345,
  });
  const pointer = voiceRunPath(id, 'checkpoints', 'latest');
  await writeVoiceDocument(pointer, 'unused');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(pointer, 'step-000001');
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  });
  expect(await getVoiceRun(id)).toMatchObject({ status: 'FAILED', checkpoint: 'step-000001' });
  expect(JSON.parse(await readFile(voiceRunPath(id, 'status.json'), 'utf8')).ownerPid).toBeUndefined();
});

it('완료하지 않은 가중치는 선택 목록이나 합성에 노출하지 않는다', async () => {
  const voice = await createVoiceDataset('학습한 목소리');
  const id = `local-${randomUUID()}`;
  await writeVoiceDocument(voiceRunPath(id, 'config.json'), {
    id,
    voiceId: voice.id,
    sampleIds: [randomUUID(), randomUUID()],
    epochs: 3,
    datasetHash: 'a'.repeat(64),
    createdAt: dayjs().toISOString(),
  });
  await writeVoiceDocument(voicePath(voice.id, 'current.json'), { runId: id });
  const run = { id, voiceId: voice.id, status: 'FAILED', step: 1, total: 6, checkpoint: 'step-000001' };
  await writeVoiceDocument(voiceRunPath(id, 'status.json'), run);
  expect(await listTrainedVoices()).toEqual([]);
  await expect(resolveTrainedVoice(id)).rejects.toMatchObject({ status: 409 });
  await writeVoiceDocument(voiceRunPath(id, 'status.json'), { ...run, status: 'SUCCEEDED' });
  expect(await listTrainedVoices()).toEqual([{ voiceId: voice.id, runId: id, name: voice.name }]);
  await expect(resolveTrainedVoice(id)).resolves.toMatchObject({ id });
});

it('동일 목소리의 편집과 학습 스냅샷을 직렬화하고 실패 뒤 잠금을 해제한다', async () => {
  const id = randomUUID();
  const gate = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = withVoiceMutation(id, async () => {
    order.push('first');
    await gate.promise;
    throw new Error('failed');
  });
  const failed = expect(first).rejects.toThrow('failed');
  const second = withVoiceMutation(id, async () => {
    order.push('second');
  });
  await Promise.resolve();
  expect(order).toEqual(['first']);
  gate.resolve();
  await failed;
  await second;
  expect(order).toEqual(['first', 'second']);
  await expect(withVoiceMutation(id, async () => 'retry')).resolves.toBe('retry');
});

it('녹음 순서는 해시에 영향을 주지 않지만 대본과 실제 오디오 해시는 반영한다', () => {
  const sample = {
    id: randomUUID(),
    filename: '녹음.wav',
    transcript: '안녕하세요',
    asset: `/api/assets/${randomUUID()}.wav`,
    duration: 3,
    contentHash: 'a'.repeat(64),
    audioHash: 'b'.repeat(64),
  };
  const other = { ...sample, id: randomUUID(), transcript: '반갑습니다' };
  expect(voiceDatasetHash([sample, other])).toBe(voiceDatasetHash([other, sample]));
  expect(voiceDatasetHash([sample])).not.toBe(voiceDatasetHash([{ ...sample, transcript: '수정한 대본' }]));
  expect(voiceDatasetHash([sample])).not.toBe(voiceDatasetHash([{ ...sample, audioHash: 'c'.repeat(64) }]));
});
