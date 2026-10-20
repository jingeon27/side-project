import { gunzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
interface IEvent {
  event_type: string;
  event_properties?: Record<string, unknown>;
  user_id?: string;
}

test('자동 페이지뷰는 이동마다 한 번만 기록하고 공통 속성과 검색어 제거를 적용해야 한다', async ({
  page,
  context,
}) => {
  const events: IEvent[] = [];
  await context.route(/https:\/\/[^/]*amplitude\.com\//, async (route) => {
    const raw = route.request().postDataBuffer();
    const body = raw?.[0] === 31 && raw?.[1] === 139 ? gunzipSync(raw) : raw;
    const payload = JSON.parse(body?.toString() ?? '{}') as { events?: IEvent[] };
    events.push(...(payload?.events ?? []));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        events_ingested: payload?.events?.length ?? 0,
        payload_size_bytes: 100,
        server_upload_time: Date.now(),
      }),
    });
  });
  await context.route('https://sentry.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/ko?q=private-search');
  const views = () => events.filter((event) => event.event_type === '[Amplitude] Page Viewed');
  await expect.poll(() => views().length).toBe(1);
  expect(views()[0]?.event_properties).toMatchObject({
    client: 'browser',
    locale: 'ko',
    screen: 'feed',
    viewport_bucket: '1024+',
  });
  await page.evaluate(() => history.pushState(null, '', '/ko/search?q=another-private-search'));
  await expect.poll(() => views().length).toBe(2);
  expect(views()[1]?.event_properties).toMatchObject({ screen: 'search' });
  expect(JSON.stringify(events)).not.toContain('private-search');
});

test('실제 오류 전송은 쿠키·검색어·사용자와 브레드크럼을 포함하지 않아야 한다', async ({ page, context }) => {
  const envelopes: string[] = [];
  await context.route(/https:\/\/[^/]*amplitude\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"code":200}' }),
  );
  await context.route('https://sentry.invalid/**', async (route) => {
    envelopes.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await context.addCookies([
    { name: 'private-cookie', value: 'private-cookie-value', url: 'http://127.0.0.1:3301' },
  ]);
  await page.goto('/ko?q=private-query-value');
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('private-error-message');
    }, 0),
  );
  await expect.poll(() => envelopes.some((value) => value.includes('\"exception\"'))).toBe(true);
  const data = envelopes.join('\n');
  expect(data).not.toContain('private-cookie-value');
  expect(data).not.toContain('private-query-value');
  expect(data).not.toContain('private-error-message');
});

test('실패한 등록은 집계하지 않고 글·채팅·메시지 성공만 집계해야 한다', async ({ page, context }) => {
  const events: IEvent[] = [];
  await context.route(/https:\/\/[^/]*amplitude\.com\//, async (route) => {
    const raw = route.request().postDataBuffer();
    const body = raw?.[0] === 31 && raw?.[1] === 139 ? gunzipSync(raw) : raw;
    const payload = JSON.parse(body?.toString() ?? '{}') as { events?: IEvent[] };
    events.push(...(payload.events ?? []));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"code":200}' });
  });
  await context.route('https://sentry.invalid/**', (route) => route.fulfill({ status: 200, body: '{}' }));
  const origin = 'http://127.0.0.1:3301';
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  await form.getByLabel('제목', { exact: true }).fill('관측 성공 이벤트');
  await form
    .getByRole('textbox', { name: '내용', exact: true })
    .fill('본문은 분석 이벤트에 포함되면 안 됩니다.');
  await page.route('**/api/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"code":"TEST_FAILURE","message":"테스트 실패"}',
    });
  });
  await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('테스트 실패');
  expect(events.filter((event) => event.event_type === 'post_created')).toHaveLength(0);
  await page.unroute('**/api/posts');
  await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(page).toHaveURL(/\/posts\//);
  await expect.poll(() => events.filter((event) => event.event_type === 'post_created').length).toBe(1);
  const authorId = (await (await page.request.get('/api/session')).json()).user.id as string;
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-3' },
  });
  await page.goto(`/ko/users/${authorId}`);
  await page
    .getByRole('button', { name: /님과 채팅하기/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/messages\//);
  await expect.poll(() => events.filter((event) => event.event_type === 'chat_started').length).toBe(1);
  await page.getByRole('textbox', { name: '메시지 내용' }).fill('분석에 포함하지 않을 메시지');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect.poll(() => events.filter((event) => event.event_type === 'message_sent').length).toBe(1);
  expect(events.find((event) => event.event_type === 'message_sent')?.event_properties).toMatchObject({
    has_attachment: false,
  });
  expect(JSON.stringify(events)).not.toContain('분석에 포함하지 않을 메시지');
});
