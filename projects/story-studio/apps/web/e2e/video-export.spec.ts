import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { libraryKey } from '../src/features/library/model/library';
import { sampleProject } from '../src/features/story/model/sample';
import { mockLibrary } from './library';

test.beforeEach(async ({ page }) => {
  await mockLibrary(page);
});

test('장면들을 한글 자막을 담은 재생 가능한 영상으로 합친다', async ({ page }, testInfo) => {
  const fixture = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d')!;
    // The recording fixture must contain a painted frame before its stream starts.
    context.fillStyle = '#5d8590';
    context.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start();
    const tick = setInterval(() => {
      context.fillStyle = '#5d8590';
      context.fillRect(0, 0, 160, 90);
    }, 60);
    await new Promise((resolve) => setTimeout(resolve, 650));
    recorder.stop();
    clearInterval(tick);
    const blob = await finished;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const project = sampleProject();
  const scenes = project.scenes.slice(0, 2).map((scene, index) => ({
    ...scene,
    duration: 2,
    dialogue: index === 0 ? '서우: 미래의 나야, 안녕' : '밤아, 이제 집에 가자',
    video: {
      id: `export-task-${index}`,
      status: 'SUCCEEDED',
      asset: '/api/assets/12345678-1234-1234-1234-123456789abc.mp4',
    },
  }));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify([value])), {
    key: libraryKey,
    value: { ...project, scenes },
  });
  await page.route('**/api/assets/*.mp4', (route) =>
    route.fulfill({ contentType: 'video/webm', body: Buffer.from(fixture) }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/studio');
  // 설정을 읽기 전의 로컬 기본값으로 서버 합성을 요청하지 않도록 브라우저 모드 준비를 기다린다.
  await expect(page.getByRole('button', { name: 'AI 연결이 필요해요' })).toBeVisible();
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  await page.getByText('내보내기', { exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /자막 넣어 영상 합치기/ }).click();
  const download = await downloading;
  const bytes = await readFile((await download.path())!);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(download.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  const video = bytes.toString('base64');
  const metadata = await page.evaluate(
    async ({ value, type }) => {
      const element = document.createElement('video');
      element.muted = true;
      element.playsInline = true;
      const loaded = new Promise<{
        width: number;
        height: number;
        frame: string;
        pixel: number[];
        captionPixels: number;
      }>((resolve, reject) => {
        element.onloadeddata = async () => {
          try {
            await element.play();
          } catch {
            reject(new Error('합본 재생 시작 실패'));
          }
        };
        // loadeddata/seeked can fire before drawImage can read the decoded surface.
        // Sample an actual presented frame instead of seeking to an arbitrary time.
        element.requestVideoFrameCallback(() => {
          const canvas = document.createElement('canvas');
          canvas.width = element.videoWidth;
          canvas.height = element.videoHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(element, 0, 0);
          element.pause();
          const pixels = context.getImageData(0, 520, canvas.width, 180).data;
          const captionPixels = Array.from({ length: pixels.length / 4 }, (_, index) => index * 4).filter(
            (index) => pixels[index]! > 210 && pixels[index + 1]! > 210 && pixels[index + 2]! > 210,
          ).length;
          resolve({
            width: element.videoWidth,
            height: element.videoHeight,
            frame: canvas.toDataURL('image/png').split(',')[1]!,
            pixel: Array.from(context.getImageData(100, 100, 1, 1).data).slice(0, 3),
            captionPixels,
          });
        });
        element.onerror = () => reject(new Error('합본 재생 실패'));
      });
      element.src = `data:${type};base64,${value}`;
      return loaded;
    },
    { value: video, type: download.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm' },
  );
  await writeFile(testInfo.outputPath('합본-첫-장면.png'), Buffer.from(metadata.frame, 'base64'));
  await download.saveAs(testInfo.outputPath(download.suggestedFilename()));
  expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 1280, height: 720 });
  expect(metadata.pixel[0]).toBeGreaterThan(60);
  expect(metadata.captionPixels).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});
