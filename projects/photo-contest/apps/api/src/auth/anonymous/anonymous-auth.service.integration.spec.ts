import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import { sha256Hex } from '../../common/crypto';

const START = 'mutation { startAnonymousSession { id nickname isAnonymous needsOnboarding } }';

describe('익명 세션', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => api?.close());

  const start = async () => {
    const response = await api.http().post('/graphql').set('Origin', TEST_WEB_ORIGIN).send({ query: START });
    expect(response.body.errors).toBeUndefined();
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith('contest_session='))?.split(';')[0];
    if (!cookie) throw new Error('익명 세션 쿠키가 필요하다');
    return {
      response,
      cookie,
      user: response.body.data.startAnonymousSession as { id: string; nickname: string },
    };
  };

  it('해시로 저장한 HttpOnly 세션을 발급하고 반복 시작에 기존 프로필을 유지해야 한다', async () => {
    const { response, cookie, user } = await start();
    expect(response.body.data.startAnonymousSession).toMatchObject({
      isAnonymous: true,
      needsOnboarding: false,
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('SameSite=Lax')]),
    );
    const token = cookie.slice('contest_session='.length);
    expect(await api.db.session.findUnique({ where: { tokenHash: sha256Hex(token) } })).toMatchObject({
      userId: user.id,
    });
    expect(await api.db.session.findUnique({ where: { tokenHash: token } })).toBeNull();
    expect(await api.gqlOk(cookie, START)).toMatchObject({ startAnonymousSession: { id: user.id } });
    expect(await api.gqlOk(cookie, '{ me { id isAnonymous } }')).toMatchObject({
      me: { id: user.id, isAnonymous: true },
    });
  });

  it('공개 그룹에만 가입하며 비공개 직접 신청과 초대 및 생성은 로그인으로 제한해야 한다', async () => {
    const { cookie, user } = await start();
    const owner = await api.signIn('익명권한그룹장');
    const publicGroup = await createGroup(api, owner, '익명 공개 그룹');
    const privateGroup = await createGroup(api, owner, '익명 비공개 그룹', [], 'PRIVATE');
    const join = 'mutation($id:ID!){requestGroupMembership(groupId:$id){id role}}';
    expect(await api.gqlOk(cookie, join, { id: publicGroup.id })).toMatchObject({
      requestGroupMembership: { role: 'MEMBER' },
    });
    expect((await api.gqlFail(cookie, join, { id: privateGroup.id })).code).toBe('UNAUTHENTICATED');
    expect(
      (
        await api.gqlFail(cookie, 'mutation($token:String!){joinGroup(token:$token){id}}', {
          token: privateGroup.inviteToken,
        })
      ).code,
    ).toBe('UNAUTHENTICATED');
    expect(
      (await api.gqlFail(cookie, 'mutation { createGroup(name:"익명 비공개 생성",visibility:PRIVATE){id} }'))
        .code,
    ).toBe('UNAUTHENTICATED');
    expect(await api.db.groupJoinRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await api.db.groupMember.count({ where: { userId: user.id, groupId: privateGroup.id } })).toBe(0);
    await api.gqlOk(
      cookie,
      'mutation($id:ID!){createPost(groupId:$id,title:"익명 게시물",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
      { id: publicGroup.id },
    );
    const registered = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({
        query:
          'mutation { registerWithPassword(loginId:"anonymous_upgrade",password:"a sufficiently long password 2026",nickname:"가입한 회원"){id isAnonymous} }',
      });
    expect(registered.body.errors).toBeUndefined();
    expect(registered.body.data.registerWithPassword).toEqual({ id: user.id, isAnonymous: false });
    expect(await api.db.post.count({ where: { authorId: user.id, groupId: publicGroup.id } })).toBe(1);
    expect(await api.db.groupMember.count({ where: { userId: user.id, groupId: publicGroup.id } })).toBe(1);
    expect(
      await api.db.session.findUnique({
        where: { tokenHash: sha256Hex(cookie.slice('contest_session='.length)) },
      }),
    ).toBeNull();
  });

  it('다른 Origin의 시작을 거부하고 로그아웃과 만료 후에는 익명 세션을 사용할 수 없어야 한다', async () => {
    for (const origin of [undefined, 'https://outside.example']) {
      const req = api.http().post('/graphql');
      if (origin) req.set('Origin', origin);
      expect((await req.send({ query: START })).status).toBe(403);
    }
    const { cookie, user } = await start();
    await api.db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(await api.gqlOk(cookie, '{ me { id } }')).toEqual({ me: null });
    await api.http().post('/auth/logout').set('Origin', TEST_WEB_ORIGIN).set('Cookie', cookie).expect(200);
    expect(await api.gqlOk(cookie, '{ me { id } }')).toEqual({ me: null });
    expect(await api.db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('로그인한 회원의 세션을 익명 프로필로 교체하지 않아야 한다', async () => {
    const member = await api.signIn('익명시작기존회원');
    expect(await api.gqlOk(member.cookie, START)).toMatchObject({
      startAnonymousSession: { id: member.id, isAnonymous: false },
    });
  });
});
