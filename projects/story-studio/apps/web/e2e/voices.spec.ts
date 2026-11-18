import { expect, test } from '@playwright/test';

import { libraryKey } from '../src/features/library/model/library';
import { sampleProject } from '../src/features/story/model/sample';
import type { TVoiceRun, TVoiceSample } from '../src/features/voice/model/voice-training';
import { readCaptions } from './captions';
import { mockLibrary, openSavedProject } from './library';

const voice = {
  id: '29edf583-4d34-4b0a-99e4-9f66bf1c6400',
  name: '별을 읽는 목소리',
  createdAt: '2026-11-15T00:00:00.000Z',
};
const runId = 'local-b27f59aa-2ad6-42bb-92f7-1dcb31c4e8c7';
const asset = '/api/assets/46e1c3bb-383b-49fa-82db-2504b8eadff6.wav';
const sample = {
  id: 'bf7078f1-77b4-47dc-8e34-fbb097616629',
  filename: '첫 녹음.wav',
  transcript: '작은 별이 밤하늘을 밝혔어요',
  duration: 3,
  asset,
  contentHash: 'a'.repeat(64),
  audioHash: 'b'.repeat(64),
};
const wav = Buffer.alloc(44 + 48_000);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24);
wav.writeUInt32LE(48000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(48000, 40);

test.beforeEach(async ({ page }) => {
  await mockLibrary(page);
});

test('여러 녹음의 부분 저장 실패 후 대본과 녹음 ID를 유지하고 재시도한다', async ({ page }) => {
  const state = { voices: [] as (typeof voice)[], samples: [] as TVoiceSample[], failed: false };
  await page.route('**/api/voices', (route) => {
    if (route.request().method() === 'POST') {
      state.voices.push(voice);
      return route.fulfill({ status: 201, json: voice });
    }
    return route.fulfill({ json: { voices: state.voices, trained: [], trainingReady: true } });
  });
  await page.route(`**/api/voices/${voice.id}`, (route) =>
    route.fulfill({ json: { voice, samples: state.samples, runs: [], trainingReady: true } }),
  );
  await page.route(`**/api/voices/${voice.id}/samples/*`, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing sample ID');
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    if (body.includes('두 번째 별') && !state.failed) {
      state.failed = true;
      return route.fulfill({ status: 502, json: { error: '둘째 녹음 저장 실패' } });
    }
    const value = {
      ...sample,
      id,
      transcript: body.includes('두 번째 별') ? '두 번째 별도 빛나요' : '첫 번째 별이 빛나요!',
      duration: 1,
    };
    if (!state.samples.some((item) => item.id === id)) state.samples.push(value);
    return route.fulfill({ json: value });
  });
  await page.route('**/api/assets/*.wav', (route) => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.goto('/studio/voices');
  await page.getByLabel('새 목소리 이름').fill(voice.name);
  await page.getByRole('button', { name: '목소리 만들기', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(voice.name);
  await page.getByLabel('녹음 선택').setInputFiles([
    { name: '첫 녹음.wav', mimeType: 'audio/wav', buffer: wav },
    { name: '둘째 녹음.wav', mimeType: 'audio/wav', buffer: wav },
  ]);
  const preview = page.getByLabel('첫 녹음.wav 선택한 녹음');
  await preview.evaluate((node) => {
    const audio = node as HTMLAudioElement;
    audio.preload = 'metadata';
    audio.load();
  });
  await page.getByLabel('녹음한 대본', { exact: true }).nth(0).fill('첫 번째 별이 빛나요');
  await expect.poll(() => readCaptions(preview)).toEqual([{ text: '첫 번째 별이 빛나요', start: 0, end: 1 }]);
  await page.getByLabel('녹음한 대본', { exact: true }).nth(0).fill('첫 번째 별이 빛나요!');
  await expect
    .poll(() => readCaptions(preview))
    .toEqual([{ text: '첫 번째 별이 빛나요!', start: 0, end: 1 }]);
  await page.getByLabel('녹음한 대본', { exact: true }).nth(1).fill('두 번째 별도 빛나요');
  await page.getByRole('button', { name: '녹음과 대본 저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '둘째 녹음 저장 실패' })).toBeVisible();
  await expect(page.getByLabel('녹음한 대본', { exact: true }).nth(1)).toHaveValue('두 번째 별도 빛나요');
  await page.getByRole('button', { name: '녹음과 대본 저장', exact: true }).click();
  await expect(page.getByLabel('녹음한 대본', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('저장한 녹음').getByRole('article')).toHaveCount(2);
  await expect
    .poll(() => readCaptions(page.getByLabel('첫 녹음.wav 저장한 녹음').first()))
    .toEqual([{ text: '첫 번째 별이 빛나요!', start: 0, end: 1 }]);
  expect(state.samples).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const action = page.getByRole('button', { name: '새 학습 시작', exact: true });
  await expect(action).toBeInViewport();
  await page.getByLabel('녹음 선택').setInputFiles(
    Array.from({ length: 49 }, (_, index) => ({
      name: `${index}.wav`,
      mimeType: 'audio/wav',
      buffer: wav,
    })),
  );
  await expect(
    page.getByRole('alert').filter({ hasText: '녹음은 48개 더 선택할 수 있습니다' }),
  ).toBeVisible();
  await expect(page.getByLabel('녹음한 대본', { exact: true })).toHaveCount(0);
});

test('가중치 학습을 중단하고 체크포인트에서 이어서 완료한다', async ({ page }) => {
  const state = { run: undefined as TVoiceRun | undefined };
  await page.route(`**/api/voices/${voice.id}`, (route) =>
    route.fulfill({
      json: {
        voice,
        samples: [sample, { ...sample, id: 'cc745b9a-d60c-4d96-8fc2-7466a275cc8b' }],
        runs: state.run ? [state.run] : [],
        trainingReady: true,
      },
    }),
  );
  await page.route(`**/api/voices/${voice.id}/train`, (route) => {
    expect(route.request().postDataJSON().epochs).toBe(3);
    state.run = {
      id: runId,
      voiceId: voice.id,
      status: 'RUNNING',
      step: 1,
      total: 6,
      checkpoint: 'step-000001',
      loss: 3.1,
      peakMemoryGiB: 5.4,
    };
    return route.fulfill({ status: 202, json: state.run });
  });
  await page.route(`**/api/voice-runs/${runId}`, (route) => {
    if (!state.run) throw new Error('No run');
    state.run = {
      ...state.run,
      status: route.request().method() === 'DELETE' ? 'CANCELLED' : 'SUCCEEDED',
      step: route.request().method() === 'DELETE' ? 1 : 6,
    };
    return route.fulfill({ json: state.run });
  });
  await page.route('**/api/voices', (route) =>
    route.fulfill({ json: { voices: [voice], trained: [], trainingReady: true } }),
  );
  await page.goto(`/studio/voices/${voice.id}`);
  await page.getByRole('button', { name: '새 학습 시작', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1/6단계');
  await page.getByRole('button', { name: '학습 중단', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('학습 중단됨');
  await page.getByRole('button', { name: '이어서 학습', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('학습 완료');
  await expect(page.getByRole('link', { name: '작업실에서 목소리 사용하기' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('장면마다 기본 음색과 말투, 학습한 목소리를 선택해 합성 요청에 전달한다', async ({ page }) => {
  const project = sampleProject();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify([value])), {
    key: libraryKey,
    value: project,
  });
  await page.route('**/api/voices', (route) =>
    route.fulfill({
      json: {
        voices: [voice],
        trained: [{ voiceId: voice.id, name: voice.name, runId }],
        trainingReady: true,
      },
    }),
  );
  const requests: unknown[] = [];
  await page.route('**/api/studio', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          provider: 'local',
          configured: true,
          textModel: 'Qwen',
          imageModel: 'Wan',
          videoModel: 'Wan',
          voiceReady: true,
          voiceTrainingReady: true,
        },
      });
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { asset, duration: 3 } });
  });
  await page.route('**/api/assets/*.wav', (route) => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.goto('/studio');
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
  const speaker = page.getByLabel('목소리', { exact: true }).first();
  await speaker.selectOption('ryan');
  await page.getByLabel('말투', { exact: true }).first().selectOption('bright');
  await page.getByRole('button', { name: '한국어 음성 생성', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '한국어 음성 다시 생성', exact: true })).toHaveCount(1);
  expect(requests[0]).toMatchObject({
    action: 'voice',
    input: { settings: { kind: 'preset', speaker: 'ryan', style: 'bright' } },
  });
  await speaker.selectOption(runId);
  await page.getByRole('button', { name: '한국어 음성 다시 생성', exact: true }).first().click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ input: { settings: { kind: 'trained', runId } } });
});
