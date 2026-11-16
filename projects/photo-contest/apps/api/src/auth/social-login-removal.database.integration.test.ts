import { expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN } from '../../test/support/app';

it('이전 인증 테이블과 경로 없이 아이디 가입·세션 조회가 동작해야 한다', async () => {
  const api = await createTestApp();
  try {
    const tables = await api.db.$queryRaw<Array<{ oauth: string | null; ticket: string | null }>>`
      SELECT to_regclass(quote_ident(current_schema()) || '."OAuthAttempt"')::text AS oauth,
             to_regclass(quote_ident(current_schema()) || '."AppLoginTicket"')::text AS ticket
    `;
    expect(tables).toEqual([{ oauth: null, ticket: null }]);
    for (const provider of ['google', 'kakao'])
      expect((await api.http().get(`/auth/${provider}`)).status).toBe(404);
    expect((await api.http().post('/auth/app/exchange').set('Origin', TEST_WEB_ORIGIN).send({})).status).toBe(
      404,
    );

    const registered = await api.http().post('/graphql').set('Origin', TEST_WEB_ORIGIN).send({
      query:
        'mutation { registerWithPassword(loginId: "retired_auth_regression", password: "regression-pass-2026", nickname: "직접 가입") { id } }',
    });
    expect(registered.body.errors).toBeUndefined();
    const cookie = registered.headers['set-cookie']?.at(-1)?.split(';')[0];
    expect(cookie).toMatch(/^contest_session=/);
    const viewer = await api.gqlOk<{ me: { id: string } }>(cookie, '{ me { id } }');
    expect(viewer.me.id).toBe(registered.body.data.registerWithPassword.id);
  } finally {
    await api.close();
  }
});
