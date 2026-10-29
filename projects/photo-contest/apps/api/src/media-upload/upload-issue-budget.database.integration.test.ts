import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { MAX_PENDING_UPLOADS, UPLOAD_ADDRESS_BUDGET, USER_STORAGE_QUOTA_BYTES } from '../config/limits';
import { Database } from '../database/database.service';
import { rateLimitBucket, RateLimitService, uploadBudgetUnits } from '../rate-limit/rate-limit.service';

const ORIGIN = 'https://budget.test';
const REQUEST_POST =
  'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"video/mp4",byteSize:$size){id}}';
const REQUEST_PROFILE =
  'mutation($size:Int!){requestProfileAvatarUpload(contentType:"image/png",byteSize:$size){id}}';

describe('업로드 발급과 IP 예산의 원자성 회귀', () => {
  const state: { api?: ITestApi } = {};
  function api() {
    if (!state.api) throw new Error('Expected an isolated upload budget fixture.');
    return state.api;
  }
  function request(cookie: string, address: string, query: string, variables: Record<string, unknown>) {
    return api()
      .http()
      .post('/graphql')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('X-Forwarded-For', address)
      .send({ query, variables })
      .expect(200);
  }
  async function actor(label: string, anonymous = false): Promise<ITestUser> {
    const nickname = `${label}-${randomUUID().slice(0, 6)}`;
    const cookie = await api().login(nickname, { anonymous });
    const user = await api().db.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: anonymous ? 'anonymous' : 'testing', providerId: nickname } },
    });
    return { cookie, id: user.id, nickname };
  }
  async function ownerGroup(label: string) {
    const owner = await actor(label);
    const response = await request(
      owner.cookie,
      '203.0.113.170',
      'mutation{createGroup(name:"예산 회귀"){id}}',
      {},
    );
    expect(response.body.errors).toBeUndefined();
    return { owner, groupId: String(response.body.data.createGroup.id) };
  }
  async function budgetCount(address: string) {
    const bucket = rateLimitBucket(`UPLOAD_BYTES:address:${address}`, UPLOAD_ADDRESS_BUDGET.windowMs);
    return (await api().db.rateLimitBucket.findUnique({ where: { keyHash: bucket.keyHash } }))?.count ?? 0;
  }

  beforeAll(async () => {
    state.api = await createTestApp(
      {
        NODE_ENV: 'production',
        WEB_ORIGIN: ORIGIN,
        S3_BUCKET: 'budget-signing-only',
        S3_REGION: 'ap-northeast-2',
        S3_ENDPOINT: '',
        AWS_ACCESS_KEY_ID: 'unit-signing-key',
        AWS_SECRET_ACCESS_KEY: 'unit-signing-secret',
        AWS_SESSION_TOKEN: '',
      },
      { shutdownHooks: false },
    );
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await state.api?.close();
  });

  it('비멤버의 거절된 100MiB 요청은 같은 IP의 발급 예산을 소비하지 않아야 한다', async () => {
    const { groupId } = await ownerGroup('예산-권한');
    const outsider = await actor('예산-익명', true);
    const address = '203.0.113.171';
    const response = await request(outsider.cookie, address, REQUEST_POST, {
      group: groupId,
      size: 100 * 1024 * 1024,
    });
    expect(response.body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(await budgetCount(address)).toBe(0);
    expect(await api().db.postUpload.count({ where: { userId: outsider.id } })).toBe(0);
  });

  it('개인 저장 용량을 넘은 게시물·프로필 발급 거절도 IP 예산을 소비하지 않아야 한다', async () => {
    const { owner, groupId } = await ownerGroup('예산-용량');
    const chunk = 1_000_000_000;
    const full = Math.floor(USER_STORAGE_QUOTA_BYTES / chunk);
    const sizes = [...Array.from({ length: full }, () => chunk), USER_STORAGE_QUOTA_BYTES - full * chunk];
    await api().db.postUpload.createMany({
      data: sizes.map((byteSize) => ({
        userId: owner.id,
        groupId,
        tokenHash: randomUUID(),
        expiresAt: new Date(0),
        kind: 'VIDEO',
        contentType: 'video/mp4',
        byteSize,
      })),
    });
    const address = '203.0.113.172';
    for (const [query, variables] of [
      [REQUEST_POST, { group: groupId, size: 1 }],
      [REQUEST_PROFILE, { size: 1 }],
    ] as const) {
      const response = await request(owner.cookie, address, query, variables);
      expect(response.body.errors?.[0]?.extensions?.code).toBe('RATE_LIMITED');
      expect(await budgetCount(address)).toBe(0);
    }
    expect(await api().db.postUpload.count({ where: { userId: owner.id } })).toBe(sizes.length);
    expect(await api().db.profileUpload.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('미완료 티켓 상한으로 거절된 게시물·프로필 요청은 발급 예산에 남기지 않아야 한다', async () => {
    const { owner, groupId } = await ownerGroup('예산-대기');
    const expiresAt = new Date(Date.now() + 60_000);
    await api().db.postUpload.createMany({
      data: Array.from({ length: MAX_PENDING_UPLOADS }, () => ({
        userId: owner.id,
        groupId,
        tokenHash: randomUUID(),
        expiresAt,
        kind: 'PHOTO',
        contentType: 'image/png',
        byteSize: 1,
      })),
    });
    await api().db.profileUpload.createMany({
      data: Array.from({ length: MAX_PENDING_UPLOADS }, () => ({
        userId: owner.id,
        storageKey: `${randomUUID()}.png`,
        contentType: 'image/png',
        byteSize: 1,
        expiresAt,
        policyExpiresAt: expiresAt,
      })),
    });
    const address = '203.0.113.173';
    for (const [query, variables] of [
      [REQUEST_POST, { group: groupId, size: 1 }],
      [REQUEST_PROFILE, { size: 1 }],
    ] as const) {
      const response = await request(owner.cookie, address, query, variables);
      expect(response.body.errors?.[0]?.extensions?.code).toBe('RATE_LIMITED');
      expect(await budgetCount(address)).toBe(0);
    }
  });

  it('서명 준비가 실패하면 두 발급 경로 모두 티켓과 IP 예산을 남기지 않아야 한다', async () => {
    const { owner, groupId } = await ownerGroup('예산-서명');
    const address = '203.0.113.174';
    const signing = vi.spyOn(api().storage, 'presignUpload');
    for (const [query, variables] of [
      [REQUEST_POST, { group: groupId, size: 1024 }],
      [REQUEST_PROFILE, { size: 1024 }],
    ] as const) {
      signing.mockRejectedValueOnce(new Error('simulated credential provider failure'));
      const response = await request(owner.cookie, address, query, variables);
      expect(response.body.errors?.[0]?.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
      expect(await budgetCount(address)).toBe(0);
    }
    expect(await api().db.postUpload.count({ where: { userId: owner.id } })).toBe(0);
    expect(await api().db.profileUpload.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('발급 트랜잭션의 후속 실패는 같은 트랜잭션의 예산도 롤백해야 한다', async () => {
    const address = '203.0.113.175';
    const failure = new Error('simulated ticket persistence failure');
    await expect(
      api()
        .app.get(Database)
        .atomic(async (tx) => {
          await api().app.get(RateLimitService).consumeUploadBytes(address, 1024, tx);
          throw failure;
        }),
    ).rejects.toBe(failure);
    expect(await budgetCount(address)).toBe(0);
  });

  it('같은 IP의 동시 게시물·프로필 발급은 커밋한 티켓만 한 번씩 예산에 반영해야 한다', async () => {
    const { owner, groupId } = await ownerGroup('예산-동시');
    const address = '203.0.113.176';
    const bucket = rateLimitBucket(`UPLOAD_BYTES:address:${address}`, UPLOAD_ADDRESS_BUDGET.windowMs);
    const budget = uploadBudgetUnits(UPLOAD_ADDRESS_BUDGET.bytes);
    await api().db.rateLimitBucket.create({ data: { ...bucket, count: budget - 8 } });
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        index % 2 === 0
          ? request(owner.cookie, address, REQUEST_POST, { group: groupId, size: 4096 })
          : request(owner.cookie, address, REQUEST_PROFILE, { size: 4096 }),
      ),
    );
    expect(responses.filter((response) => !response.body.errors)).toHaveLength(2);
    expect(
      responses
        .filter((response) => response.body.errors)
        .map((response) => response.body.errors[0].extensions.code),
    ).toEqual(Array.from({ length: 6 }, () => 'RATE_LIMITED'));
    expect(await budgetCount(address)).toBe(budget);
    const tickets = await Promise.all([
      api().db.postUpload.count({ where: { userId: owner.id } }),
      api().db.profileUpload.count({ where: { userId: owner.id } }),
    ]);
    // 파일을 실제로 보내지 않고 발급만 받은 티켓도 기존 정책대로 예산을 쓴다.
    expect(tickets.reduce((sum, count) => sum + count, 0)).toBe(2);
  });
});
