import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../support/app';

describe('공개 Next Data Cache용 GraphQL 응답', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => {
    await api.close();
  });

  it('명시한 공개 조회의 업무 오류를 HTTP 400으로 보내 캐시에 저장되지 않게 해야 한다', async () => {
    const response = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('x-photo-contest-public-query', 'true')
      .send({ query: '{group(id:"cache-missing"){id}}' });
    expect(response.status).toBe(400);
    expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
  it('일반 GraphQL의 HTTP 200 오류 계약과 인증 요구를 유지해야 한다', async () => {
    const normal = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ query: '{group(id:"cache-missing"){id}}' });
    expect(normal.status).toBe(200);
    const mutation = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('x-photo-contest-public-query', 'true')
      .send({ query: 'mutation{createGroup(name:"인증 필요"){id}}' });
    expect(mutation.status).toBe(200);
    expect(mutation.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const privateRead = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('x-photo-contest-public-query', 'true')
      .send({ query: '{myGroups{id}}' });
    expect(privateRead.status).toBe(400);
    expect(privateRead.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
  it('성공한 공개 조회는 HTTP 200이고 Origin 검사를 우회하지 않아야 한다', async () => {
    const success = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('x-photo-contest-public-query', 'true')
      .send({ query: '{publicGroupCount}' });
    expect(success.status).toBe(200);
    expect(success.body.errors).toBeUndefined();
    expect(
      (
        await api
          .http()
          .post('/graphql')
          .set('Origin', 'https://foreign.example')
          .set('x-photo-contest-public-query', 'true')
          .send({ query: '{publicGroupCount}' })
      ).status,
    ).toBe(403);
  });
});
