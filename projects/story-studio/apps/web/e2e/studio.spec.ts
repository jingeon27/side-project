import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import dayjs from 'dayjs';

import { libraryKey } from '../src/features/library/model/library';
import { sampleProject } from '../src/features/story/model/sample';
import { mockLibrary, openLibraryMenu, openSavedProject } from './library';

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
test.beforeEach(async ({ page }) => {
  await mockLibrary(page);
});
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
test('소개에 표시한 애니메이션 원본을 작업실에서 연다', async ({ page }) => {
  await page.route('**/api/demo', (route) => route.fulfill({ status: 404 }));
  await page.goto('/');
  await page.getByRole('link', { name: /별빛을 안은 고양이/ }).click();
  await expect(page).toHaveURL(/demo=bundled/);
  await expect(page.getByLabel('작품 제목', { exact: true })).toHaveValue('별빛을 안은 고양이');
});
test('작업실을 열어 둬도 Gemma와 FLUX가 모두 준비된 뒤에만 이미지 버튼이 켜진다', async ({ page }) => {
  await page.clock.install();
  const models = { textReady: false, imageReady: false };
  await page.route('**/api/studio', (route) =>
    route.fulfill({
      json: { ...config, provider: 'local', configured: models.textReady, ...models },
    }),
  );
  await page.goto('/studio?sample=1');
  const image = page.getByRole('button', { name: '이미지 생성', exact: true }).first();
  await expect(image).toBeVisible();
  await expect(image).toBeDisabled();
  for (const [textReady, imageReady] of [
    [false, true],
    [true, false],
    [true, true],
  ] as const) {
    Object.assign(models, { textReady, imageReady });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().endsWith('/api/studio') && response.request().method() === 'GET',
      ),
      page.clock.fastForward(16_000),
    ]);
    await expect(image).toBeEnabled({ enabled: textReady && imageReady });
  }
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
  await openSavedProject(page, /서울에서 온 편지/);
  await expect(page.getByLabel('작품 제목', { exact: true })).toHaveValue('서울에서 온 편지 🐈');
  await expect(page.getByLabel('한국어 대사, 자막', { exact: true }).first()).toHaveValue(
    '서우: 괜찮아, 이번엔 내가 기다릴게.',
  );
  await openLibraryMenu(page);
  await page
    .getByLabel('작품 백업 파일')
    .setInputFiles({ name: '작품.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(page.getByRole('status')).toContainText('새 사본으로 가져왔습니다');
  await expect(page.getByRole('navigation', { name: '저장한 작품' }).getByRole('button')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
// The server writes into the work itself; the browser starts a job and follows it.
async function mockWriting(
  page: Page,
  write: (body: { action: string; input: Record<string, unknown> }) => object,
) {
  const job = { id: crypto.randomUUID(), fail: false, requests: [] as object[], status: {} as object };
  await page.route('**/api/studio', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (job.fail)
      return route.fulfill({ status: 502, json: { error: 'AI가 잠시 쉬고 있어요. 다시 시도해 주세요.' } });
    const body = route.request().postDataJSON();
    job.requests.push(body);
    job.status = write(body);
    return route.fulfill({
      json: { id: job.id, status: 'RUNNING', progress: '집필을 준비하는 중', scenes: 0 },
    });
  });
  await page.route('**/api/writing/*', (route) =>
    route.fulfill({ json: { id: job.id, progress: '', ...job.status } }),
  );
  return job;
}
function novelFixture() {
  const sample = sampleProject();
  const chapter = (title: string, narration: string) => ({
    ...sample.scenes[0]!,
    id: crypto.randomUUID(),
    title,
    narration,
  });
  const novel = { ...sample, id: crypto.randomUUID(), brief: { ...sample.brief, format: 'novel' as const } };
  return { novel, chapter };
}
async function startNovel(page: Page) {
  await page.goto('/studio');
  await page.getByRole('button', { name: /소설 문장으로/ }).click();
  await page
    .getByLabel('이야기 아이디어', { exact: true })
    .fill('미래에서 온 편지를 읽은 서우가 자신의 이야기를 소설로 쓰기 시작한다.');
  await page.getByRole('button', { name: '이야기 만들기', exact: true }).click();
}
test('소설 생성과 이어쓰기, 실패 후 기존 원고 보존', async ({ page }) => {
  await connect(page);
  const library = await mockLibrary(page);
  const { novel, chapter } = novelFixture();
  const job = await mockWriting(page, (body) => {
    const written = library.projects[0];
    if (body.action === 'write')
      library.projects.unshift({
        ...novel,
        scenes: [
          chapter('미래에서 온 편지', '“안녕, 미래의 나.” 서우가 편지를 펼쳤다.'),
          chapter('새벽의 답장', '서우는 한글로 긴 편지를 쓰기 시작했다.'),
        ],
      });
    else if (written)
      library.projects[0] = {
        ...written,
        scenes: [...written.scenes, chapter('다음 장', '이어 쓴 본문')],
        updatedAt: dayjs().toISOString(),
      };
    return { status: 'SUCCEEDED', projectId: novel.id, scenes: library.projects[0]?.scenes.length };
  });
  await startNovel(page);
  // One click starts the job; the chapters it saved arrive with the work.
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('본문', { exact: true }).first()).toHaveValue(
    '“안녕, 미래의 나.” 서우가 편지를 펼쳤다.',
  );
  expect(job.requests[0]).toMatchObject({ action: 'write', input: { format: 'novel' } });
  await page.getByRole('button', { name: '다음 장 이어 쓰기' }).click();
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(3);
  // Continuing names the work only; the server reads the manuscript from its own file.
  expect(job.requests[1]).toEqual({ action: 'continue', input: { projectId: novel.id } });
  job.fail = true;
  await page.getByRole('button', { name: '다음 장 이어 쓰기' }).click();
  await expect(page.getByRole('status')).toContainText('AI가 잠시 쉬고 있어요');
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(3);
});

test('구성한 장을 쓰다 실패해도 쓴 장을 보존하고 남은 구성부터 이어 쓴다', async ({ page }) => {
  await connect(page);
  const library = await mockLibrary(page);
  const { novel, chapter } = novelFixture();
  const beats = ['둘째 장', '셋째 장'].map((title) => ({ title, summary: `${title}의 사건` }));
  await mockWriting(page, (body) => {
    const written = library.projects[0];
    if (body.action === 'write') {
      library.projects.unshift({ ...novel, scenes: [chapter('첫 장', '첫 장 본문')], outline: beats });
      return { status: 'FAILED', projectId: novel.id, scenes: 1, error: '둘째 장을 쓰지 못했습니다.' };
    }
    if (written)
      library.projects[0] = {
        ...written,
        scenes: [...written.scenes, chapter('둘째 장', '둘째 장 본문')],
        outline: beats.slice(1),
        updatedAt: dayjs().toISOString(),
      };
    return { status: 'SUCCEEDED', projectId: novel.id, scenes: 2 };
  });
  await startNovel(page);
  await expect(page.getByRole('status').filter({ hasText: '둘째 장을 쓰지 못했습니다.' })).toBeVisible();
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(1);
  await expect(page.getByText('구성해 둔 장이 2개 남았습니다.')).toBeVisible();
  await page.getByRole('button', { name: '다음 장 이어 쓰기' }).click();
  await expect(page.getByLabel('본문', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('본문', { exact: true }).nth(1)).toHaveValue('둘째 장 본문');
  await expect(page.getByText('구성해 둔 장이 1개 남았습니다.')).toBeVisible();
});

test('다른 도구에서 만든 이미지를 작품 비율로 가져오고 붙여 넣을 프롬프트를 복사한다', async ({
  page,
  context,
}) => {
  await connect(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([value]));
    },
    { key: libraryKey, value: sampleProject() },
  );
  await page.goto('/studio');
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
  await page.getByRole('button', { name: '프롬프트 복사' }).first().click();
  await expect(page.getByRole('status')).toContainText('이미지 프롬프트를 복사했습니다');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('화면 비율: 16:9');
  // A 3:2 picture, as an external image tool returns it.
  const picture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const drawing = canvas.getContext('2d')!;
    drawing.fillStyle = '#cead88';
    drawing.fillRect(0, 0, 300, 200);
    return canvas.toDataURL('image/jpeg').split(',')[1]!;
  });
  await page
    .getByLabel('1번째 장면 이미지 파일', { exact: true })
    .setInputFiles({ name: 'scene.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(picture, 'base64') });
  const image = page.locator('.scene-visual img').first();
  await expect(image).toHaveAttribute('src', /^\/api\/assets\/[a-f0-9-]{36}\.png$/);
  await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1920);
  expect(await image.evaluate((node) => (node as HTMLImageElement).naturalHeight)).toBe(1080);
  await page.reload();
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
  await expect(page.locator('.scene-visual img').first()).toHaveAttribute('src', /\.png$/);
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
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
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
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
  await page.getByRole('button', { name: '영상 생성', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '영상 만드는 중…' }).first()).toBeDisabled();
  await page.reload();
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
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
  const library = await mockLibrary(page, [sampleProject()]);
  await page.goto('/studio');
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
  const title = page.getByLabel('작품 제목', { exact: true });
  await title.fill('');
  await title.pressSequentially('새로운 이야기', { delay: 20 });
  await expect.poll(() => library.saves).toBe(1);
  await title.fill('새로고침 직전의 마지막 한국어 편집');
  // The page closes before the half second delay ends; the unsaved edit is sent on the next visit.
  await page.reload();
  await openSavedProject(page, /새로고침 직전의 마지막 한국어 편집/);
  await expect(title).toHaveValue('새로고침 직전의 마지막 한국어 편집');
  expect(library.projects[0]?.title).toBe('새로고침 직전의 마지막 한국어 편집');
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
  await openSavedProject(page, /비가 오면, 편지가 도착해/);
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
