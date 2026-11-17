import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { dataPath } from '../../media/server/assets';
import { createVoiceDataset, getVoiceSamples, voiceRunPath, writeVoiceDocument } from './voice-store';
import { uploadVoiceSample } from './voice-upload';

const worker = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../../shared/server/local-worker', () => ({ runLocal: worker.run }));
const state = { directory: '' };
const wav = Buffer.from('RIFFxxxxWAVEaudio-fixture');
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'voice-upload-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  worker.run.mockReset().mockImplementation(async () => {
    const id = `${randomUUID()}.wav`;
    await mkdir(dataPath('assets'), { recursive: true });
    await writeFile(dataPath('assets', id), 'normalized fixture');
    return { asset: `/api/assets/${id}`, duration: 3 };
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});
function uploadRequest(bytes = wav, transcript = '안녕하세요. 녹음한 대본입니다.') {
  const body = new FormData();
  body.set('file', new File([bytes], '녹음.wav'));
  body.set('transcript', transcript);
  return new Request('http://127.0.0.1:3400/api/voices', { method: 'PUT', body });
}

it('부분 업로드 재시도는 같은 녹음을 중복 저장하지 않고 임시 원본을 정리한다', async () => {
  const voice = await createVoiceDataset('내 목소리');
  const id = randomUUID();
  const sample = await uploadVoiceSample(uploadRequest(), voice.id, id);
  expect(await uploadVoiceSample(uploadRequest(), voice.id, id)).toEqual(sample);
  expect(worker.run).toHaveBeenCalledTimes(1);
  expect(await getVoiceSamples(voice.id)).toHaveLength(1);
  expect(await readdir(dataPath('voice-uploads'))).toEqual([]);
  expect(await readFile(dataPath('assets', path.basename(sample.asset)), 'utf8')).toBe('normalized fixture');
});

it('플레이리스트와 학습 중인 자료 수정을 변환 실행 전에 거부한다', async () => {
  const voice = await createVoiceDataset('보존할 자료');
  await expect(
    uploadVoiceSample(uploadRequest(Buffer.from('#EXTM3U\nhttps://example.com')), voice.id, randomUUID()),
  ).rejects.toMatchObject({ status: 400 });
  const id = `local-${randomUUID()}`;
  await writeVoiceDocument(voiceRunPath(id, 'config.json'), {
    id,
    voiceId: voice.id,
    sampleIds: [randomUUID(), randomUUID()],
    datasetHash: 'a'.repeat(64),
    epochs: 3,
    createdAt: '2026-11-15T00:00:00.000Z',
  });
  await writeVoiceDocument(voiceRunPath(id, 'status.json'), {
    id,
    voiceId: voice.id,
    status: 'RUNNING',
    step: 0,
    total: 6,
  });
  await expect(uploadVoiceSample(uploadRequest(), voice.id, randomUUID())).rejects.toMatchObject({
    status: 409,
  });
  expect(worker.run).not.toHaveBeenCalled();
});

it('파일 교체가 실패해도 기존 녹음과 대본은 그대로 보존한다', async () => {
  const voice = await createVoiceDataset('보존 검증');
  const id = randomUUID();
  const original = await uploadVoiceSample(uploadRequest(), voice.id, id);
  worker.run.mockRejectedValueOnce(new Error('변환 실패'));
  await expect(uploadVoiceSample(uploadRequest(wav, '변경한 녹음 대본'), voice.id, id)).rejects.toThrow(
    '변환 실패',
  );
  expect(await getVoiceSamples(voice.id)).toEqual([original]);
  expect(await readFile(dataPath('assets', path.basename(original.asset)), 'utf8')).toBe(
    'normalized fixture',
  );
  expect(await readdir(dataPath('voice-uploads'))).toEqual([]);
});
