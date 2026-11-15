import { expect, test } from '@playwright/test';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});
const voice = {
  id: '29edf583-4d34-4b0a-99e4-9f66bf1c6400',
  name: '마이크 검증 목소리',
  createdAt: '2026-11-15T00:00:00.000Z',
};
const asset = '/api/assets/46e1c3bb-383b-49fa-82db-2504b8eadff6.wav';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/voices', (route) =>
    route.fulfill({ json: { voices: [voice], trained: [], trainingReady: true } }),
  );
  await page.route(`**/api/voices/${voice.id}`, (route) =>
    route.fulfill({ json: { voice, samples: [], runs: [], trainingReady: true } }),
  );
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const streams: MediaStream[] = [];
    Object.assign(window, { capturedTestStreams: streams });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
});

test('브라우저에서 녹음한 WAV를 들어보고 대본과 저장하며 실패 후에도 보존한다', async ({ page }) => {
  const state = { uploads: 0, ids: [] as string[] };
  await page.route(`**/api/voices/${voice.id}/samples/*`, (route) => {
    const body = route.request().postDataBuffer();
    if (!body) throw new Error('Missing recording');
    const offset = body.indexOf('RIFF');
    expect(offset).toBeGreaterThan(0);
    expect(body.readUInt32LE(offset + 24)).toBe(24000);
    expect(body.readUInt16LE(offset + 22)).toBe(1);
    const duration = body.readUInt32LE(offset + 40) / 48000;
    expect(duration).toBeGreaterThanOrEqual(1);
    expect(duration).toBeLessThanOrEqual(30);
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing sample ID');
    state.uploads += 1;
    state.ids.push(id);
    if (state.uploads === 1)
      return route.fulfill({ status: 502, json: { error: '녹음 저장을 다시 시도해 주세요' } });
    return route.fulfill({
      json: {
        id,
        filename: '마이크 녹음.wav',
        transcript: '작은 별이 빛나는 밤입니다',
        duration,
        asset,
        contentHash: 'a'.repeat(64),
        audioHash: 'b'.repeat(64),
      },
    });
  });
  await page.goto(`/studio/voices/${voice.id}`);
  await page.getByRole('button', { name: '마이크로 녹음 시작', exact: true }).click();
  await expect(page.getByRole('timer', { name: '녹음 시간' })).toContainText('2초');
  const finish = page.getByRole('button', { name: '녹음 마치기', exact: true });
  await expect(finish).toBeInViewport();
  await finish.click();
  const transcript = page.getByLabel('녹음한 대본', { exact: true });
  await expect(transcript).toBeVisible();
  const audio = page.locator('#voice-upload audio');
  const duration = await audio.evaluate(async (element) => {
    const media = element as HTMLAudioElement;
    const loaded = new Promise<number>((resolve, reject) => {
      media.onloadedmetadata = () => resolve(media.duration);
      media.onerror = () => reject(new Error('Cannot play recording'));
    });
    media.preload = 'metadata';
    media.load();
    return loaded;
  });
  expect(duration).toBeGreaterThanOrEqual(1);
  await transcript.fill('작은 별이 빛나는 밤입니다');
  await page.getByRole('button', { name: '녹음과 대본 저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '녹음 저장을 다시 시도해 주세요' })).toBeVisible();
  await expect(transcript).toHaveValue('작은 별이 빛나는 밤입니다');
  await page.getByRole('button', { name: '녹음과 대본 저장', exact: true }).click();
  await expect(transcript).toHaveCount(0);
  expect(state.ids[0]).toBe(state.ids[1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('취소와 화면 이동은 마이크 트랙을 닫고 취소한 녹음을 추가하지 않는다', async ({ page }) => {
  await page.goto(`/studio/voices/${voice.id}`);
  await page.getByRole('button', { name: '마이크로 녹음 시작', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: '녹음 취소', exact: true }).click();
  await expect(page.getByLabel('녹음한 대본', { exact: true })).toHaveCount(0);
  const closed = () =>
    page.evaluate(() => {
      const state = window as typeof window & { capturedTestStreams: MediaStream[] };
      return state.capturedTestStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      );
    });
  await expect.poll(closed).toBe(true);
  await page.getByRole('button', { name: '마이크로 녹음 시작', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('link', { name: '목소리 목록', exact: true }).click();
  await expect(page).toHaveURL('/studio/voices');
  await expect.poll(closed).toBe(true);
});

test('마이크 권한 거부를 안내하고 파일 업로드를 계속 제공한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
  });
  await page.goto(`/studio/voices/${voice.id}`);
  await page.getByRole('button', { name: '마이크로 녹음 시작', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '사이트 설정에서 마이크를 허용' })).toBeVisible();
  await expect(page.getByRole('button', { name: '마이크로 녹음 시작', exact: true })).toBeEnabled();
  await expect(page.getByLabel('녹음 선택')).toBeAttached();
});
