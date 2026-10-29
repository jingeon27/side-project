import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';
import { UPLOAD_ADDRESS_BUDGET, WRITE_RATE_LIMIT } from '../config/limits';
import {
  rateLimitBucket,
  UPLOAD_BUDGET_EXCEEDED,
  uploadBudgetUnits,
  WRITE_RATE_LIMITED,
} from './rate-limit.service';

const ORIGIN = 'https://web.test';
const CREATE_GROUP = 'mutation($name:String!){createGroup(name:$name){id}}';

describe('쓰기 남용 제한', () => {
  let api: ITestApi;

  beforeAll(async () => {
    // 운영에서만 제한하므로 Caddy 한 단계를 신뢰하는 운영 모드 앱을 만든다. 운영은 개발 로그인이 닫혀 있다.
    api = await createTestApp({ NODE_ENV: 'production', WEB_ORIGIN: ORIGIN });
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 운영 세션 쿠키(__Host-contest_session)를 가진 사용자를 격리 DB에 바로 만든다. */
  const signIn = async (nickname: string) => {
    const user = await api.db.user.create({
      data: { provider: 'dev', providerId: `rate-limit-${randomUUID()}`, nickname },
    });
    const token = randomBytes(32).toString('base64url');
    await api.db.session.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    return `__Host-contest_session=${token}`;
  };

  /** Caddy가 붙인 사용자 주소로 GraphQL을 보낸다. */
  const graphql = (cookie: string, address: string, query: string, variables: Record<string, unknown>) =>
    api
      .http()
      .post('/graphql')
      .set('Origin', ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .set('Cookie', cookie)
      .set('X-Forwarded-For', address)
      .send({ query, variables });
  const createGroup = (cookie: string, address: string, name: string) =>
    graphql(cookie, address, CREATE_GROUP, { name });

  it('사용자마다 그룹 생성 수를 제한하고 다른 사용자는 따로 세야 한다', async () => {
    const { perUser } = WRITE_RATE_LIMIT.GROUP_CREATE;
    const owner = await signIn('제한-그룹장');
    for (let index = 0; index < perUser; index++) {
      const response = await createGroup(owner, '203.0.113.30', `제한 그룹 ${index}`);
      expect(response.body.errors, `${index + 1}번째 그룹`).toBeUndefined();
    }
    const blocked = await createGroup(owner, '203.0.113.31', '제한 초과 그룹');
    expect(blocked.body.errors[0]).toMatchObject({
      message: WRITE_RATE_LIMITED,
      extensions: { code: 'RATE_LIMITED' },
    });
    const other = await signIn('제한-다른 회원');
    expect((await createGroup(other, '203.0.113.30', '다른 회원 그룹')).body.errors).toBeUndefined();
  });

  it('주소마다 하루 동안 발급한 업로드 크기를 계정과 상관없이 합쳐 제한해야 한다', async () => {
    const REQUEST =
      'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:$size){id}}';
    const address = '203.0.113.50';
    const owner = await signIn('업로드예산-그룹장');
    const { body } = await createGroup(owner, address, '업로드 예산 그룹');
    const groupId: string = body.data.createGroup.id;
    // 이번 창의 남은 예산을 12KiB로 맞춘다. 계정마다 따로 세지 않으므로 다른 사용자가 써도 같은 버킷이다.
    const bucket = rateLimitBucket(`UPLOAD_BYTES:address:${address}`, UPLOAD_ADDRESS_BUDGET.windowMs);
    const budget = uploadBudgetUnits(UPLOAD_ADDRESS_BUDGET.bytes);
    await api.db.rateLimitBucket.upsert({
      where: { keyHash: bucket.keyHash },
      create: { ...bucket, count: budget - 12 },
      update: { count: budget - 12 },
    });
    const blocked = await graphql(owner, address, REQUEST, { group: groupId, size: 20 * 1024 });
    expect(blocked.body.errors[0]).toMatchObject({
      message: UPLOAD_BUDGET_EXCEEDED,
      extensions: { code: 'RATE_LIMITED' },
    });
    // 넘친 요청분은 되돌려 남은 예산 안의 작은 파일은 계속 올린다.
    expect(
      (await graphql(owner, address, REQUEST, { group: groupId, size: 10 * 1024 })).body.errors,
    ).toBeUndefined();
    expect(
      (await api.db.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: bucket.keyHash } })).count,
    ).toBe(budget - 2);
    expect(
      (await graphql(owner, address, REQUEST, { group: groupId, size: 4 * 1024 })).body.errors[0],
    ).toMatchObject({
      message: UPLOAD_BUDGET_EXCEEDED,
    });
    expect(
      (await graphql(owner, '203.0.113.51', REQUEST, { group: groupId, size: 4 * 1024 })).body.errors,
    ).toBeUndefined();
  });
});
