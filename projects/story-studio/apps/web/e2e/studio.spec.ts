import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { libraryKey } from '../src/lib/library';
import { sampleProject } from '../src/lib/sample';

const config = {
  provider: 'cloud',
  configured: true,
  textModel: 'qwen3.8-max',
  imageModel: 'qwen-image-2.0-pro',
  videoModel: 'wan2.7-t2v',
};
async function connect(page: Page) {
  await page.route('**/api/studio', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: config }) : route.fallback(),
  );
}
test('소개와 작업실을 구분하고 선택한 형식으로 창작을 시작한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('당신의 상상에다음 장면을');
  await expect(page.getByLabel('이야기 아이디어', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '웹툰 한 컷씩 펼쳐지는 세계' }).click();
  await expect(page).toHaveURL(/\/studio\?format=webtoon/);
  await expect(page.getByRole('button', { name: /웹툰 한 컷씩/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('이야기 아이디어', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('새 작품 만들기');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('소개에서 예시를 열면 작업실의 편집 화면으로 바로 이동한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '예시 작품 둘러보기' }).click();
  await expect(page).toHaveURL(/\/studio\?sample=1/);
  await expect(page.getByLabel('작품 제목', { exact: true })).toHaveValue('비가 오면, 편지가 도착해');
});
test('연결 없이 예시를 편집하고 한글 원고·JSON 백업을 복원한다', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: '새 작품 만들기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI 연결이 필요해요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '이야기 만들기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '예시 작품 열기' }).click();
  await page.getByLabel('작품 제목', { exact: true }).fill('서울에서 온 편지 🐈');
  const dialogue = page.getByLabel('한국어 대사, 자막', { exact: true }).first();
  await dialogue.fill('서우: 괜찮아, 이번엔 내가 기다릴게.');
  await page.getByText('내보내기', { exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '작품 백업 (.json)', exact: true }).click();
  const download = await downloading;
  const content = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(content).scenes[0].dialogue).toContain('이번엔 내가 기다릴게');
  await page.reload();
  await page.getByRole('button', { name: /서울에서 온 편지/ }).click();
  await expect(page.getByLabel('작품 제목', { exact: true })).toHaveValue('서울에서 온 편지 🐈');
  await expect(page.getByLabel('한국어 대사, 자막', { exact: true }).first()).toHaveValue(
    '서우: 괜찮아, 이번엔 내가 기다릴게.',
  );
  await page
    .getByLabel('작품 백업 파일')
    .setInputFiles({ name: '작품.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(page.getByRole('status')).toContainText('새 사본으로 가져왔습니다');
  await expect(page.getByRole('navigation', { name: '저장한 작품' }).getByRole('button')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('소설 생성과 이어쓰기, 실패 후 기존 원고 보존', async ({ page }) => {
  await connect(page);
  const project = sampleProject();
  const state = { fail: false };
  await page.route('**/api/studio', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    if (state.fail)
      return route.fulfill({ status: 502, json: { error: 'AI가 잠시 쉬고 있어요. 다시 시도해 주세요.' } });
    return route.fulfill({
      json:
        body.action === 'continue'
          ? {
              ...project.scenes[0],
              title: '새벽의 답장',
              narration: '서우는 한글로 긴 편지를 쓰기 시작했다.',
            }
          : {
              ...project,
              scenes: [{ ...project.scenes[0], narration: '“안녕, 미래의 나.” 서우가 편지를 펼쳤다.' }],
            },
    });
  });
  await page.goto('/studio');
  await page.getByRole('button', { name: /소설 문장으로/ }).click();
  await page
    .getByLabel('이야기 아이디어', { exact: true })
    .fill('미래에서 온 편지를 읽은 서우가 자신의 이야기를 소설로 쓰기 시작한다.');
  await page.getByRole('button', { name: '이야기 만들기', exact: true }).click();
  await expect(page.getByLabel('본문', { exact: true }).first()).toHaveValue(
    '“안녕, 미래의 나.” 서우가 편지를 펼쳤다.',
  );
  await page.getByRole('button', { name: '다음 장 이어 쓰기' }).click();
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('본문', { exact: true }).nth(1)).toHaveValue(
    '서우는 한글로 긴 편지를 쓰기 시작했다.',
  );
  state.fail = true;
  await page.getByRole('button', { name: '다음 장 이어 쓰기' }).click();
  await expect(page.getByRole('status')).toContainText('AI가 잠시 쉬고 있어요');
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(2);
});
test('웹툰 말풍선과 이미지를 미리보고 한글 PNG로 내보낸다', async ({ page }) => {
  await connect(page);
  const project = sampleProject();
  const asset = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
  const webtoon = {
    ...project,
    brief: { ...project.brief, format: 'webtoon', ratio: '9:16' },
    scenes: [{ ...project.scenes[0], image: asset }],
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify([value])), {
    key: libraryKey,
    value: webtoon,
  });
  // A local synthetic PNG fixture, with no external generation or billing.
  const imageFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#cead88';
    context.fillRect(0, 0, 64, 96);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.route('**/api/assets/*.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(imageFixture, 'base64'),
    }),
  );
  await page.goto('/studio');
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  await page.getByLabel('한국어 말풍선', { exact: true }).fill('서우: 미래의 나야, 안녕!');
  await page.getByText('세로 웹툰 미리보기', { exact: true }).click();
  await expect(page.locator('.speech-bubble')).toHaveText('서우: 미래의 나야, 안녕!');
  await page.getByText('내보내기', { exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '한글 말풍선 포함 웹툰 (.png)' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile((await download.path())!);
  expect(png.length).toBeGreaterThan(1000);
});
test('영상 작업은 중복 제출 없이 새로고침 후 상태를 확인한다', async ({ page }) => {
  await connect(page);
  const project = sampleProject();
  const state = { posts: 0, polls: 0 };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([value]));
    },
    { key: libraryKey, value: project },
  );
  await page.route('**/api/studio', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.posts += 1;
    return route.fulfill({ json: { id: 'test-video-task', status: 'PENDING' } });
  });
  await page.route('**/api/tasks/*', (route) => {
    state.polls += 1;
    return route.fulfill({
      json: { id: 'test-video-task', status: 'FAILED', error: '검증용 영상 생성 실패. 원고는 유지됩니다.' },
    });
  });
  await page.goto('/studio');
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  await page.getByRole('button', { name: '영상 생성', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '영상 만드는 중…' }).first()).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  await expect(page.getByText('검증용 영상 생성 실패. 원고는 유지됩니다.')).toBeVisible();
  expect(state.posts).toBe(1);
  expect(state.polls).toBeGreaterThan(0);
  await expect(page.getByLabel('1번째 제목', { exact: true })).toHaveValue('지도에 없는 우체국');
});
test('손상된 저장본을 보존하고 자동 저장 실패를 알린다', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken'), libraryKey);
  await page.goto('/studio');
  await expect(page.getByRole('alert').filter({ hasText: '원본은 보존했습니다' })).toBeVisible();
  await page.getByRole('button', { name: '예시 작품 열기' }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), libraryKey)).toBe('{broken');
  await expect(page.getByText('저장 확인 필요', { exact: true })).toBeAttached();
});

test('연속 입력은 한 번 저장하고 즉시 새로고침해도 마지막 편집을 보존한다', async ({ page }) => {
  await connect(page);
  await page.addInitScript(
    ({ key, project }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([project]));
      const monitor = window as typeof window & { studioWrites: number };
      monitor.studioWrites = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) monitor.studioWrites += 1;
        original.call(this, name, value);
      };
    },
    { key: libraryKey, project: sampleProject() },
  );
  await page.goto('/studio');
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  const title = page.getByLabel('작품 제목', { exact: true });
  await title.fill('');
  await title.pressSequentially('새로운 이야기', { delay: 20 });
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { studioWrites: number }).studioWrites))
    .toBe(1);
  await title.fill('새로고침 직전의 마지막 한국어 편집');
  await page.reload();
  await page.getByRole('button', { name: /새로고침 직전의 마지막 한국어 편집/ }).click();
  await expect(title).toHaveValue('새로고침 직전의 마지막 한국어 편집');
});

test('API 키 없이 실제 로컬 생성 예시의 한국어 음성과 완성 영상을 재생한다', async ({ page }, info) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.goto('/studio?demo=1');
  await expect(page.getByLabel('작품 제목', { exact: true })).toHaveValue('별빛을 안은 고양이');
  const movie = page.getByLabel('한국어 음성과 자막이 들어간 완성 영상', { exact: true });
  await expect.poll(() => movie.evaluate((node) => (node as HTMLVideoElement).duration)).toBeGreaterThan(13);
  expect(await movie.evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBe(640);
  const voice = page.getByLabel('1번째 한국어 음성', { exact: true });
  await expect.poll(() => voice.evaluate((node) => (node as HTMLAudioElement).duration)).toBeGreaterThan(12);
  await movie.evaluate(async (node) => {
    const video = node as HTMLVideoElement;
    video.muted = true;
    await video.play();
  });
  await expect
    .poll(() => movie.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.1);
  await movie.evaluate((node) => (node as HTMLVideoElement).pause());
  await page.screenshot({ path: info.outputPath('local-animation.png'), fullPage: true });
  expect(external).toEqual([]);
});

test('긴 소설의 이어쓰기는 전체 원고 대신 최근 여섯 장면만 전송한다', async ({ page }) => {
  await connect(page);
  const sample = sampleProject();
  const novel = {
    ...sample,
    brief: { ...sample.brief, format: 'novel' },
    scenes: Array.from({ length: 12 }, (_, index) => ({
      ...sample.scenes[0]!,
      id: crypto.randomUUID(),
      title: `${index + 1}번째 장`,
      narration: '긴 원고가 이어집니다. '.repeat(400),
    })),
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify([value])), {
    key: libraryKey,
    value: novel,
  });
  const submitted = Promise.withResolvers<unknown>();
  await page.route('**/api/studio', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    submitted.resolve(route.request().postDataJSON().input);
    return route.fulfill({ json: { ...sample.scenes[0], title: '새로운 장' } });
  });
  await page.goto('/studio');
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  await page.getByRole('button', { name: '다음 장 이어 쓰기' }).click();
  const input = (await submitted.promise) as { scenes: { title: string }[] };
  expect(input.scenes).toHaveLength(6);
  expect(input.scenes[0]?.title).toBe('7번째 장');
  await expect(page.getByLabel('13번째 제목', { exact: true })).toHaveValue('새로운 장');
});

test('생성 중인 로컬 영상은 중단한 뒤 작품을 삭제한다', async ({ page }) => {
  const sample = sampleProject();
  const id = `local-${crypto.randomUUID()}`;
  const project = { ...sample, scenes: [{ ...sample.scenes[0]!, video: { id, status: 'RUNNING' } }] };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify([value])), {
    key: libraryKey,
    value: project,
  });
  await page.route('**/api/studio', (route) =>
    route.fulfill({
      json: { ...config, provider: 'local', voiceReady: true, videoReady: true, imageReady: true },
    }),
  );
  await page.route('**/api/tasks/*', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'DELETE'
          ? { id, status: 'FAILED', error: '사용자가 영상 생성을 중단했습니다' }
          : { id, status: 'RUNNING' },
    }),
  );
  await page.goto('/studio');
  await page.getByRole('button', { name: /비가 오면, 편지가 도착해/ }).click();
  await page.getByRole('button', { name: '이 작품 삭제', exact: true }).click();
  await expect(
    page.getByText('영상 생성이 진행 중입니다. 해당 장면에서 생성을 중단한 뒤 작품을 삭제해 주세요.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: '영상 생성 중단', exact: true }).click();
  await expect(page.getByText('사용자가 영상 생성을 중단했습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이 작품 삭제', exact: true }).click();
  await page
    .getByRole('button', { name: '이 작품의 원고를 삭제할까요? 한 번 더 눌러 확인', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '새 작품 만들기', exact: true })).toBeVisible();
});
