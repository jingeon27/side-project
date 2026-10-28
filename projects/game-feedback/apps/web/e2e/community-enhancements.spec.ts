import { readFileSync } from 'node:fs';

import { adminApi } from './admin-api';
import { expect, test } from './support/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';

for (const scenario of [
  {
    width: 1440,
    type: 'MONTHLY',
    role: 'COACH',
    label: '기간 수강료 (원)',
    amount: '250000',
    summary: '기간 총 ₩250,000',
  },
  {
    width: 320,
    type: 'GOAL',
    role: 'STUDENT',
    label: '목표 달성 희망 총 수강료 (원)',
    amount: '500000',
    summary: '목표 달성까지 총 ₩500,000',
  },
]) {
  test(`${scenario.type} coaching fees persist through edits and switching pricing removes hidden goal data`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto('/ko/boards/coaching');
    await page.getByRole('button', { name: '코칭 등록', exact: true }).click();
    const editor = page.getByRole('form', { name: /글쓰기|게시글 수정/ });
    const title = `${scenario.type} 코칭 모집 ${Date.now().toString(36)}`;
    await editor.getByLabel('모집 유형', { exact: true }).selectOption(scenario.role);
    await editor.getByLabel('수강료 기준', { exact: true }).selectOption(scenario.type);
    if (scenario.type === 'GOAL') {
      await expect(editor.getByText('목표 점수를 1~100자로 입력해주세요.', { exact: true })).toHaveCount(0);
      await editor.getByLabel('제목', { exact: true }).fill(title);
      await editor
        .getByRole('textbox', { name: '내용', exact: true })
        .fill('정한 목표 점수까지 함께 연습할 유료 코치를 구하고 있습니다.');
      await editor.getByRole('button', { name: '코칭 등록', exact: true }).click();
      await expect(editor.getByText('목표 점수를 1~100자로 입력해주세요.', { exact: true })).toBeVisible();
      await editor.getByLabel('목표 점수', { exact: true }).fill('9,000 트로피');
    }
    await editor.getByLabel(scenario.label, { exact: true }).fill(scenario.amount);
    await editor.getByLabel('제목', { exact: true }).fill(title);
    await editor
      .getByRole('textbox', { name: '내용', exact: true })
      .fill('기간과 목표 점수를 정하고 함께 연습할 유료 코칭을 모집합니다.');
    await expect(editor.getByText('내 게임 프로필', { exact: true })).toHaveCount(0);
    await editor.getByRole('button', { name: '코칭 등록', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.locator('.detail-card:visible .coaching-summary')).toContainText(scenario.summary);
    if (scenario.type === 'GOAL')
      await expect(page.locator('.detail-card:visible .coaching-summary')).toContainText('9,000 트로피');
    const url = page.url();
    await page.reload();
    await expect(page.locator('.detail-card:visible .coaching-summary')).toContainText(scenario.summary);
    const crawler = await browser.newContext({ javaScriptEnabled: false });
    try {
      const response = await (await crawler.newPage()).goto(url);
      expect(await response?.text()).toContain(scenario.summary);
    } finally {
      await crawler.close();
    }
    await page.locator('.detail-card').getByRole('button', { name: '수정', exact: true }).click();
    await expect(editor.getByLabel('수강료 기준', { exact: true })).toHaveValue(scenario.type);
    await expect(editor.getByLabel(scenario.label, { exact: true })).toHaveValue(scenario.amount);
    await editor.getByLabel('수강료 기준', { exact: true }).selectOption('HOURLY');
    await expect(editor.getByLabel('목표 점수', { exact: true })).toHaveCount(0);
    await editor
      .getByLabel(scenario.role === 'STUDENT' ? '시간당 희망 수강료 (원)' : '시간당 수강료 (원)', {
        exact: true,
      })
      .fill('');
    await page.getByRole('dialog').getByRole('button', { name: '수정 완료', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.detail-card:visible .coaching-summary')).toContainText('시간당 수강료 협의');
    await expect(page.locator('.detail-card:visible .coaching-summary')).not.toContainText('9,000 트로피');
    await page.goto(`/ko?q=${encodeURIComponent(title)}`);
    await expect(page.locator('.post-card:visible .coaching-summary')).toContainText('시간당 수강료 협의');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('editor inserts uploaded photos and playable video and preserves media through saving, editing and public HTML', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/boards/free');
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const editor = page.getByRole('form', { name: /글쓰기|게시글 수정/ });
  await expect(editor.getByLabel('제목', { exact: true })).toHaveAttribute('maxlength', '60');
  const title = `본문 미디어 삽입 ${Date.now().toString(36)}`;
  await editor.getByLabel('제목', { exact: true }).fill(title);
  await editor
    .getByRole('textbox', { name: '내용', exact: true })
    .fill('본문 사진과 동영상을 저장하고 편집 후에도 그대로 유지하는 게시글입니다.');
  const image = readFileSync(
    new URL('../src/features/game-profile/assets/clash-royale-icon.jpg', import.meta.url),
  );
  await page.route('**/api/post-media/uploads', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ errorCode: 'TEMPORARY', message: '테스트 업로드 실패' }),
    }),
  );
  const failedChooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '사진 삽입', exact: true }).click();
  await (await failedChooser).setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(editor.getByRole('alert')).toContainText('테스트 업로드 실패');
  await expect(editor.getByLabel('제목', { exact: true })).toHaveValue(title);
  await page.unrouteAll({ behavior: 'wait' });
  const imageChooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '사진 삽입', exact: true }).click();
  await (await imageChooser).setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(editor.locator('.ql-editor img')).toBeVisible();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    canvas.getContext('2d')?.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    const result = new Promise<number[]>((resolve, reject) => {
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onerror = () => reject(new Error('Recording failed'));
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve([...new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())]);
      };
    });
    recorder.start();
    setTimeout(() => recorder.stop(), 200);
    return result;
  });
  const videoChooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '동영상 삽입', exact: true }).click();
  await (
    await videoChooser
  ).setFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(editor.locator('.ql-editor video')).toBeVisible();
  await editor.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  const video = page.locator('.prose-body video');
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await expect(page.locator('.prose-body img')).toBeVisible();
  const url = page.url();
  await page.reload();
  await page.locator('.detail-card').getByRole('button', { name: '수정', exact: true }).click();
  await expect(editor.locator('.ql-editor img')).toBeVisible();
  await expect(editor.locator('.ql-editor video')).toBeVisible();
  await editor.getByLabel('제목', { exact: true }).fill(title + ' 수정');
  await page.getByRole('dialog').getByRole('button', { name: '수정 완료', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const crawler = await browser.newContext({ javaScriptEnabled: false });
  try {
    const other = await crawler.newPage();
    await other.goto(url);
    await expect(other.locator('.prose-body img')).toBeVisible();
    await expect(other.locator('.prose-body video')).toHaveAttribute('controls', '');
    const mediaUrl = await other.locator('.prose-body video').getAttribute('src');
    expect((await crawler.request.get(mediaUrl ?? '', { headers: { Range: 'bytes=0-31' } })).status()).toBe(
      206,
    );
  } finally {
    await crawler.close();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('verification opens a private admin chat and an administrator reviews user reports, verifies and bans or releases the user', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const suffix = Date.now().toString(36);
  const session = await (
    await page.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname: `문의_${suffix}` },
    })
  ).json();
  const userId = session.user.id;
  await page.request.post('/api/me/game-accounts', {
    headers: { Origin: origin },
    data: { playerTag: '#GG829JGY' },
  });
  await page.goto('/ko/settings');
  await page.getByRole('button', { name: '프로필 인증 문의', exact: true }).click();
  await expect(page).toHaveURL(/\/messages\//);
  const supportUrl = page.url();
  const request = `프로필 인증 부탁드립니다 ${suffix}`;
  await page.getByRole('textbox', { name: '메시지 내용' }).fill(request);
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page.getByRole('log').getByText(request, { exact: true })).toBeVisible();
  const adminContext = await browser.newContext({ baseURL: origin });
  const reporterContext = await browser.newContext({ baseURL: origin });
  try {
    await adminContext.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-test-admin' },
    });
    const threads = (await (await adminContext.request.get(adminApi('/api/admin/support'))).json()).items;
    const thread = threads.find((item: { requester: { id: string } }) => item.requester.id === userId);
    expect(thread).toBeTruthy();
    const reply = `인증 확인 완료 ${suffix}`;
    expect(
      (
        await adminContext.request.post(`/api/conversations/${thread.conversationId}/messages`, {
          headers: { Origin: origin },
          data: { body: reply, clientMessageId: crypto.randomUUID() },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await adminContext.request.patch(adminApi(`/api/admin/users/${userId}/verification`), {
          headers: { Origin: origin },
          data: { isVerified: true },
        })
      ).ok(),
    ).toBe(true);
    expect((await (await page.request.get('/api/session')).json()).user.isVerified).toBe(true);
    await page.reload();
    await expect(page.getByRole('log').getByText(reply, { exact: true })).toBeVisible();
    await reporterContext.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-3' },
    });
    const reporter = await reporterContext.newPage();
    await reporter.goto(`/ko/users/${userId}`);
    await reporter.getByRole('button', { name: '사용자 신고', exact: true }).click();
    const dialog = reporter.getByRole('dialog');
    await dialog.getByLabel('신고 사유', { exact: true }).selectOption('HARASSMENT');
    await dialog.getByLabel('추가 설명 (선택)', { exact: true }).fill(`사용자 신고 ${suffix}`);
    await dialog.getByRole('button', { name: '신고 접수', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const { items: reports } = await (
      await adminContext.request.get(adminApi('/api/admin/reports?limit=50'))
    ).json();
    const report = reports.find((item: { detail: string }) => item.detail === `사용자 신고 ${suffix}`);
    expect(report).toBeTruthy();
    expect(
      (
        await adminContext.request.patch(adminApi(`/api/admin/reports/${report.id}`), {
          headers: { Origin: origin },
          data: { status: 'REVIEWED' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await adminContext.request.patch(adminApi(`/api/admin/users/${userId}/ban`), {
          headers: { Origin: origin },
          data: { banned: true, reason: '테스트 신고 검토 후 제재' },
        })
      ).ok(),
    ).toBe(true);
    const input = {
      categoryId: 'clash-royale',
      board: 'FREE',
      title: '제재 해제 후 작성',
      body: '관리자가 제재를 해제한 뒤 다시 글을 쓸 수 있는지 확인합니다.',
    };
    expect(
      (await page.request.post('/api/posts', { headers: { Origin: origin }, data: input })).status(),
    ).toBe(403);
    await page.goto(supportUrl);
    await page.getByRole('textbox', { name: '메시지 내용' }).fill('이용 제한에 대해 문의합니다.');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(
      page.getByRole('log').getByText('이용 제한에 대해 문의합니다.', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await adminContext.request.patch(adminApi(`/api/admin/users/${userId}/ban`), {
          headers: { Origin: origin },
          data: { banned: false, reason: '문의 확인 후 제재 해제' },
        })
      ).ok(),
    ).toBe(true);
    expect((await page.request.post('/api/posts', { headers: { Origin: origin }, data: input })).ok()).toBe(
      true,
    );
    expect((await page.request.get('/ko/admin')).status()).toBe(404);
    expect((await page.request.get('/api/admin/auth/session')).status()).toBe(404);
    expect(
      (
        await page.request.post('/api/admin/auth/login', {
          data: { username: 'admin', password: 'not-a-real-password' },
        })
      ).status(),
    ).toBe(404);
    expect((await page.request.get('/api/admin/support')).status()).toBe(404);
  } finally {
    await adminContext.close();
    await reporterContext.close();
  }
});
