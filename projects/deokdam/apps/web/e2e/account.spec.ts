import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { signInFixture, testOrigin } from './account-fixture';

test('guests create all three kinds of history before a real local login; only their chosen account receives them', async ({
  page,
  context,
  browser,
}, testInfo) => {
  const first = testInfo.project.name === 'mobile' ? 'A' : 'B';
  const other = first === 'A' ? 'B' : 'A';
  const suffix = randomUUID().slice(0, 8);
  const message = '오늘은 첫 문장만 서로 읽어보자 ' + suffix;
  const note = '지금 내 기기에서 남긴 실천 ' + suffix;
  const privateExperience = '친구와 면접을 연습했던 비공개 경험 ' + suffix;
  for (const path of [
    '/api/orders',
    '/api/orders/claim',
    '/api/orders/dw-0123456789abcdef0123456789abcdef',
    '/api/journal',
    '/api/journal/activity',
  ])
    expect((await context.request.post(path, { data: {} })).status()).toBe(401);
  await page.goto('/shop/orders');
  await expect(page.getByRole('heading', { name: '내 계정으로 7일 풀이 열기' })).toBeVisible();
  await page.goto('/cards/baek-beonjjae-jiwonseo');
  await page.getByLabel('내 말투로 바꿔 보내기').fill(message);
  await page.getByRole('button', { name: '덕담 만들기' }).click();
  await expect(page.getByText('덕담을 만들었어요. 로그인하면 기록장에서 다시 볼 수 있어요.')).toBeVisible();
  await page.getByLabel('남기고 싶은 한 줄').fill(note);
  await page.getByRole('button', { name: '오늘 해봤어요' }).click();
  await expect(page.getByText('오늘의 덕을 남겼어요')).toBeVisible();
  await page.goto('/reading');
  await page.getByLabel('내 생년월일').fill('19920417');
  await page.getByLabel(/과거에 겪은 일/).fill(privateExperience);
  await page.getByRole('button', { name: '내 풀이 보기' }).click();
  await expect(page.getByRole('heading', { name: '오늘의 기본 풀이' })).toBeVisible();
  await page.getByRole('link', { name: '기록장에서 다시 보기' }).click();
  await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '카카오로 계속하기' })).toBeEnabled();
  expect((await context.request.get('/api/journal')).status()).toBe(401);
  await expect(page.getByText(message)).toHaveCount(0);
  await page.getByRole('button', { name: '테스트 계정 ' + first + '로 로그인' }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('region', { name: '만든 덕담' }).getByText(message)).toBeVisible();
  await expect(page.getByRole('heading', { name: '받은 풀이' })).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  const journal = await (await context.request.get('/api/journal')).json();
  expect(JSON.stringify(journal)).not.toContain('19920417');
  expect(JSON.stringify(journal)).not.toContain(privateExperience);
  expect(
    journal.activities.filter((item: { page: { text?: string } }) => item.page.text === message),
  ).toHaveLength(1);
  expect((await context.cookies()).find((item) => item.name === 'deokdam.session')?.httpOnly).toBe(true);
  const device = await browser.newContext({ baseURL: testOrigin });
  try {
    const second = await device.newPage();
    await second.goto('/login');
    await second.getByRole('button', { name: '테스트 계정 ' + first + '로 로그인' }).click();
    await expect(second.getByText(message)).toBeVisible();
    await expect(second.getByText(note)).toBeVisible();
    const secondRecords = await (await device.request.get('/api/journal')).json();
    expect(secondRecords.activities).toEqual(journal.activities);
    await second.getByRole('button', { name: '로그아웃' }).click();
    await expect(second.getByRole('heading', { name: '내 덕 기록장 열기' })).toBeVisible();
    expect((await device.request.get('/api/journal')).status()).toBe(401);
    await second.getByRole('button', { name: '테스트 계정 ' + other + '로 로그인' }).click();
    await expect(second.getByRole('heading', { name: '덕 기록장', exact: true })).toBeVisible();
    expect(JSON.stringify(await (await device.request.get('/api/journal')).json())).not.toContain(suffix);
  } finally {
    await device.close();
  }
});

test('local server rejects cross-origin, forwarded hosts and unrecognized test accounts', async ({
  request,
}) => {
  const path = '/api/auth/local-login';
  for (const [headers, status] of [
    [{ origin: 'https://foreign.example' }, 403],
    [{ origin: testOrigin, 'x-forwarded-host': 'deokdam.bambyul.com' }, 404],
  ] as const) {
    expect((await request.post(path, { form: { account: 'A' }, headers, maxRedirects: 0 })).status()).toBe(
      status,
    );
  }
  const unknown = await request.post(path, {
    form: { account: 'someone-else' },
    headers: { origin: testOrigin },
    maxRedirects: 0,
  });
  expect(unknown.status()).toBe(400);
  expect((await request.get('/api/journal')).status()).toBe(401);
});

test('same-provider accounts share their journal across devices, with separate ownership and an explicit legacy import', async ({
  page,
  context,
  browser,
}) => {
  const subject = randomUUID();
  const owner = await signInFixture(context, 'google', subject);
  const record = { topic: 'job', action: '초안에서 한 문장 읽기', note: '내 메모' };
  const headers = { origin: testOrigin, 'x-deokdam-account': owner };
  const first = await context.request.post(testOrigin + '/api/journal', { data: record, headers });
  expect(first.status()).toBe(201);
  const today = (await (await context.request.get(testOrigin + '/api/journal?today=1')).json()).today;
  expect(today).toEqual({ action: record.action });
  const conflict = await context.request.post(testOrigin + '/api/orders', {
    data: { adult: true, product: 'job-week' },
    headers: { origin: testOrigin, 'x-deokdam-account': randomUUID() },
  });
  expect(conflict.status()).toBe(412);
  expect(
    (await (await context.request.post(testOrigin + '/api/journal', { data: record, headers })).json())
      .created,
  ).toBe(false);
  const second = await browser.newContext();
  try {
    await signInFixture(second, 'google', subject);
    const shared = await second.newPage();
    await shared.goto(testOrigin + '/journal');
    await expect(shared.getByText('내 메모')).toBeVisible();
    await signInFixture(second, 'kakao', subject);
    await shared.reload();
    await expect(shared.getByRole('heading', { name: '첫 번째 덕을 남겨보세요' })).toBeVisible();
    await expect(shared.getByText('내 메모')).toHaveCount(0);
    expect(
      (
        await second.request.delete(testOrigin + '/api/journal', { headers, data: { date: '2020-01-01' } })
      ).status(),
    ).toBe(409);
  } finally {
    await second.close();
  }
  await page.goto('/journal');
  await page.evaluate(
    (input) =>
      localStorage.setItem(
        'deokdam.journal.v1.2020-01-01',
        JSON.stringify({ ...input, action: '예전 메모를 읽기', date: '2020-01-01' }),
      ),
    record,
  );
  await page.reload();
  await page.getByRole('button', { name: '내 계정으로 가져오기' }).click();
  await expect(page.getByText('예전 메모를 읽기')).toBeVisible();
  await expect(page.getByRole('button', { name: '내 계정으로 가져오기' })).toHaveCount(0);
});

test('both OAuth starts redirect to the registered provider and cancellation preserves the destination', async ({
  request,
}) => {
  for (const provider of ['google', 'kakao']) {
    const start = await request.post('/api/auth/' + provider, {
      form: { next: '/shop?topic=parent' },
      headers: { origin: testOrigin },
      maxRedirects: 0,
    });
    expect(start.status()).toBe(303);
    const target = new URL(start.headers().location ?? '');
    expect(target.hostname).toBe(provider === 'google' ? 'accounts.google.com' : 'kauth.kakao.com');
    expect(target.searchParams.get('redirect_uri')).toBe(testOrigin + '/api/auth/' + provider + '/callback');
    const state = target.searchParams.get('state');
    const cancelled = await request.get('/api/auth/' + provider + '/callback', {
      params: { state: state ?? '', error: 'access_denied' },
      maxRedirects: 0,
    });
    expect(cancelled.headers().location).toContain('next=%2Fshop%3Ftopic%3Dparent&error=cancelled');
  }
});

test('an interrupted import stays with the first account until a later retry', async ({ page, context }) => {
  const text = '동기화 재시도 ' + randomUUID().slice(0, 8);
  await page.goto('/cards/chingu-hapgyeok');
  await page.getByLabel('내 말투로 바꿔 보내기').fill(text);
  await page.getByRole('button', { name: '덕담 만들기' }).click();
  await expect(page.getByText('덕담을 만들었어요. 로그인하면 기록장에서 다시 볼 수 있어요.')).toBeVisible();
  const subject = randomUUID();
  await signInFixture(context, 'kakao', subject);
  await page.route('**/api/journal/activity', (route) => route.abort('failed'));
  await page.goto('/journal');
  await expect(page.getByRole('button', { name: '이 기기의 기록 다시 동기화' })).toBeVisible();
  await page.unroute('**/api/journal/activity');
  await signInFixture(context, 'google', subject);
  await page.reload();
  await expect(page.getByRole('heading', { name: '첫 번째 덕을 남겨보세요' })).toBeVisible();
  await expect(page.getByText(text)).toHaveCount(0);
  await signInFixture(context, 'kakao', subject);
  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
  const list = page.getByRole('region', { name: '만든 덕담' });
  page.once('dialog', (dialog) => dialog.accept());
  await list.getByRole('button', { name: '만든 덕담 기록 지우기' }).click();
  await expect(list).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '첫 번째 덕을 남겨보세요' })).toBeVisible();
});
