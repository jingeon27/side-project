import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { signInFixture, testOrigin } from './account-fixture';

test('journal and all purchase actions require an account and returning from login keeps the draft private', async ({
  page,
  context,
}) => {
  const request = context.request;
  for (const endpoint of [
    '/api/orders',
    '/api/orders/claim',
    '/api/orders/dw-0123456789abcdef0123456789abcdef',
    '/api/journal',
  ]) {
    expect((await request.post(testOrigin + endpoint, { data: {} })).status()).toBe(401);
  }
  for (const endpoint of ['/api/orders', '/api/journal'])
    expect((await request.get(testOrigin + endpoint)).status()).toBe(401);
  await page.goto('/shop/orders');
  await expect(page.getByRole('heading', { name: '내 계정으로 7일 풀이 열기' })).toBeVisible();
  await page.goto('/cards/baek-beonjjae-jiwonseo');
  await page.getByLabel('남기고 싶은 한 줄').fill('이 메모는 내 계정에서만 보여요');
  await page.getByRole('button', { name: '로그인하고 기록 남기기' }).click();
  await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '카카오로 계속하기' })).toBeEnabled();
  expect(page.url()).not.toContain('메모');
  await signInFixture(context, 'kakao');
  await page.reload();
  await expect(page.getByLabel('남기고 싶은 한 줄')).toHaveValue('이 메모는 내 계정에서만 보여요');
  await page.getByRole('button', { name: '내 기록장에 저장' }).click();
  await expect(page.getByRole('heading', { name: '1일의 덕을 남겼어요' })).toBeVisible();
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('heading', { name: '내 덕 기록장 열기' })).toBeVisible();
  expect((await request.get(testOrigin + '/api/journal')).status()).toBe(401);
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
