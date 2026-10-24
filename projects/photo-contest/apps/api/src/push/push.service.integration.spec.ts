import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExpoPushTransport, type IPushMessage } from '@side/push-notifications';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { PushService } from './push.service';

describe('세션에 연결한 앱 푸시', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => api?.close());
  const register = async (
    user: ITestUser,
    installationId = randomUUID(),
    token = `ExpoPushToken[${randomUUID().replaceAll('-', '')}]`,
  ) => {
    await api
      .http()
      .post('/push/devices/register')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', user.cookie)
      .send({ installationId, token, platform: 'android', locale: 'ko' })
      .expect(200);
    return installationId;
  };
  const setup = async (label: string) => {
    const owner = await api.signIn(`푸시${label}주인`),
      member = await api.signIn(`푸시${label}회원`);
    const group = await createGroup(api, owner, `푸시 ${label} 그룹`, [member]);
    const post = (
      await api.gqlOk<{ createPost: { id: string } }>(
        owner.cookie,
        'mutation($id:ID!){createPost(groupId:$id,title:"비밀 게시물 제목",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
        { id: group.id },
      )
    ).createPost;
    const comment = () =>
      api.gqlOk(member.cookie, 'mutation($id:ID!){createPostComment(postId:$id,body:"비밀 댓글 본문"){id}}', {
        id: post.id,
      });
    return { owner, member, group, post, comment };
  };
  const run = async () => {
    const messages: IPushMessage[] = [];
    const transport = new ExpoPushTransport({
      fetch: async (_url, options) => {
        const batch = JSON.parse(String(options?.body)) as IPushMessage[];
        messages.push(...batch);
        return Response.json({
          data: batch.map((_item, index) => ({ status: 'ok', id: `pc-ticket-${index}` })),
        });
      },
    });
    await api.app.get(PushService).runOnce(transport);
    return messages;
  };

  it('로그인·Origin·입력을 검사하고 로그아웃하면 같은 세션의 기기와 대기 전송도 지워야 한다', async () => {
    const { owner, comment } = await setup('인증');
    await api.http().post('/push/devices/register').set('Origin', TEST_WEB_ORIGIN).send({}).expect(400);
    const id = await register(owner);
    await api
      .http()
      .post('/push/devices/unregister')
      .set('Origin', 'https://evil.example')
      .set('Cookie', owner.cookie)
      .send({ installationId: id })
      .expect(403);
    await comment();
    expect(await api.db.pushDelivery.count({ where: { deviceId: id } })).toBe(1);
    await api
      .http()
      .post('/auth/logout')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(await api.db.pushDevice.findUnique({ where: { id } })).toBeNull();
    expect(await api.db.pushDelivery.count({ where: { deviceId: id } })).toBe(0);
    expect(await run()).toEqual([]);
  });

  it('댓글은 한 기기에 한 번 전송하고 잠금화면에 비공개 그룹·게시물·댓글 내용을 넣지 않아야 한다', async () => {
    const { owner, comment } = await setup('본문');
    const id = await register(owner);
    await comment();
    const messages = await run();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ badge: 1, data: { path: '/notifications' } });
    expect(JSON.stringify(messages)).not.toMatch(/비밀|본문주인|본문 그룹/);
    expect(await run()).toEqual([]);
    expect(await api.db.pushDelivery.count({ where: { deviceId: id, status: 'TICKET' } })).toBe(1);
    await api.db.pushDevice.delete({ where: { id } });
  });

  it('읽은 알림과 숨긴 글·탈퇴한 그룹의 알림을 전송 직전에 취소해야 한다', async () => {
    const { owner, group, post, comment } = await setup('가시성');
    const id = await register(owner);
    await comment();
    await api.gqlOk(owner.cookie, 'mutation { markAllNotificationsRead }');
    expect(await run()).toEqual([]);
    await comment();
    await api.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    expect(await run()).toEqual([]);
    await api.db.post.update({ where: { id: post.id }, data: { hidden: false } });
    await comment();
    await api.db.groupMember.delete({ where: { groupId_userId: { groupId: group.id, userId: owner.id } } });
    expect(await run()).toEqual([]);
    expect(await api.db.pushDelivery.count({ where: { deviceId: id, status: 'CANCELLED' } })).toBe(3);
    await api.db.pushDevice.delete({ where: { id } });
  });

  it('기기 계정 전환은 이전 전송을 삭제하고 만료 세션과 남의 기기 해제를 차단해야 한다', async () => {
    const { owner, member, comment } = await setup('전환');
    const id = await register(owner);
    await comment();
    await api
      .http()
      .post('/push/devices/unregister')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', member.cookie)
      .send({ installationId: id })
      .expect(200);
    expect(await api.db.pushDevice.findUnique({ where: { id } })).toMatchObject({ userId: owner.id });
    await register(member, id);
    expect(await api.db.pushDelivery.count({ where: { deviceId: id } })).toBe(0);
    const device = await api.db.pushDevice.findUniqueOrThrow({ where: { id } });
    await api.db.session.update({
      where: { tokenHash: device.sessionKey },
      data: { expiresAt: new Date(0) },
    });
    expect(await run()).toEqual([]);
    expect(await api.db.pushDevice.findUnique({ where: { id } })).toBeNull();
  });
});
