import { randomUUID } from 'node:crypto';
import { recordEvent } from '../analytics/analytics-event.writer';
import { Database } from './database.service';

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import type { ITestApi } from '../../test/support/app';
import { createTestApp } from '../../test/support/app';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { ERROR_MESSAGE } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';
import { UnitOfWork } from './unit-of-work';

const userData = () => {
  const id = `repo-user-${randomUUID()}`;
  return { id, nickname: 'DB 회원', provider: 'test', providerId: id };
};
const groupData = (name = 'DB 그룹') => {
  const id = `repo-group-${randomUUID()}`;
  return { id, name, inviteToken: id, inviteHash: id };
};

class TransactionBarrier {
  private arrivals = 0;
  private release = () => {};
  private readonly ready = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async arrive() {
    this.arrivals += 1;
    if (this.arrivals === 2) this.release();
    await this.ready;
  }
}

describe('DB transaction boundaries', () => {
  const userId = `repository-user-${randomUUID()}`;
  const groupId = `repository-group-${randomUUID()}`;
  const eventId = `repository-event-${randomUUID()}`;
  const failure = new Error('Cancel the entire operation');
  const state: { api?: ITestApi } = {};

  beforeAll(async () => {
    const url = new URL(inject('databaseUrl'));
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '2');
    state.api = await createTestApp({ DATABASE_URL: url.toString() });
  });
  afterAll(async () => {
    await state.api?.close();
  });
  const currentApi = () => {
    if (!state.api) throw new Error('Test application was not initialized');
    return state.api;
  };

  it('uses one connection across domains and rolls back writes and analytics together', async () => {
    const api = state.api;
    if (!api) throw new Error('Test application was not initialized');
    const auth = api.app.get(Database);
    const groups = api.app.get(Database);
    const work = api.app.get(UnitOfWork);
    await expect(
      work.atomic(async (client) => {
        await (client ?? auth).user.create({
          data: { id: userId, nickname: 'DB 회원', provider: 'test', providerId: userId },
        });
        await (client ?? groups).group.create({
          data: {
            id: groupId,
            name: 'DB 그룹',
            inviteToken: groupId,
            inviteHash: groupId,
            members: { create: { userId, role: 'OWNER' } },
          },
        });
        await recordEvent(client ?? groups, {
          id: eventId,
          type: ANALYTICS_EVENT.GROUP_CREATED,
          userId,
          properties: { groupId },
        });
        expect(
          await (client ?? groups).groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } }),
        ).toMatchObject({ userId, groupId });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await api.db.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await api.db.group.findUnique({ where: { id: groupId } })).toBeNull();
    expect(await api.db.groupMember.count({ where: { groupId, userId } })).toBe(0);
    expect(await api.db.analyticsEvent.findUnique({ where: { id: eventId } })).toBeNull();
  });

  it('단일 연결에서 사용자·그룹·멤버십·이벤트를 함께 커밋해야 한다', async () => {
    const api = currentApi();
    const auth = api.app.get(Database);
    const groups = api.app.get(Database);
    const user = userData();
    const group = groupData();
    const event = `repo-commit:${group.id}`;
    const created = await api.app.get(UnitOfWork).atomic(async (client) => {
      await (client ?? auth).user.create({ data: user });
      const row = await (client ?? groups).group.create({
        data: { ...group, members: { create: { userId: user.id, role: 'OWNER' } } },
      });
      await recordEvent(client ?? groups, {
        id: event,
        type: ANALYTICS_EVENT.GROUP_CREATED,
        userId: user.id,
        properties: { groupId: group.id },
      });
      return row;
    });
    expect(created.id).toBe(group.id);
    expect(
      await api.db.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: user.id } },
      }),
    ).toMatchObject({ role: 'OWNER' });
    expect(await api.db.analyticsEvent.findUnique({ where: { id: event } })).toMatchObject({
      userId: user.id,
      properties: { groupId: group.id },
    });
  });
  it('배열 트랜잭션에서 다른 DB의 lazy query와 반환 순서를 유지해야 한다', async () => {
    const api = currentApi();
    const user = userData();
    const group = groupData();
    const [createdUser, createdGroup] = await api.app
      .get(UnitOfWork)
      .run([
        api.app.get(Database).user.create({ data: user }),
        api.app
          .get(Database)
          .group.create({ data: { ...group, members: { create: { userId: user.id, role: 'OWNER' } } } }),
      ]);
    expect(createdUser.id).toBe(user.id);
    expect(createdGroup.id).toBe(group.id);
    expect(await api.db.groupMember.count({ where: { groupId: group.id, userId: user.id } })).toBe(1);
  });
  it('배열의 뒤 쿼리에서 unique 오류가 나면 앞의 쓰기를 롤백하고 원래 오류를 전파해야 한다', async () => {
    const api = currentApi();
    const group = await api.db.group.create({ data: groupData() });
    const user = userData();
    await expect(
      api.app
        .get(UnitOfWork)
        .run([
          api.app.get(Database).user.create({ data: user }),
          api.app.get(Database).group.create({ data: group }),
        ]),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await api.db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await api.db.group.findUnique({ where: { id: group.id } })).toMatchObject({ name: group.name });
  });
  it('atomic unique 오류는 재시도 없이 CONFLICT로 변환하고 다른 도메인의 쓰기도 롤백해야 한다', async () => {
    const api = currentApi();
    const user = await api.db.user.create({ data: userData() });
    const group = groupData();
    const calls = { count: 0 };
    await expect(
      api.app.get(UnitOfWork).atomic(async (client) => {
        calls.count += 1;
        const repository = api.app.get(Database);
        await (client ?? repository).group.create({ data: group });
        await recordEvent(client ?? repository, {
          id: group.id,
          type: ANALYTICS_EVENT.GROUP_CREATED,
          userId: user.id,
          properties: { groupId: group.id },
        });
        await (client ?? api.app.get(Database)).user.create({
          data: { ...userData(), provider: user.provider, providerId: user.providerId },
        });
      }),
    ).rejects.toMatchObject({ message: ERROR_MESSAGE.ALREADY_DONE, extensions: { code: 'CONFLICT' } });
    expect(calls.count).toBe(1);
    expect(await api.db.group.findUnique({ where: { id: group.id } })).toBeNull();
    expect(await api.db.analyticsEvent.findUnique({ where: { id: group.id } })).toBeNull();
  });
  it('실제 직렬화 충돌을 재시도해 동시 변경을 잃지 않고 이벤트를 한 번씩 남겨야 한다', async () => {
    const baseUrl = new URL(inject('databaseUrl'));
    baseUrl.searchParams.set('connection_limit', '2');
    const api = await createTestApp({ DATABASE_URL: baseUrl.toString() });
    try {
      const group = await api.db.group.create({ data: groupData('0') });
      const barrier = new TransactionBarrier();
      const attempts = [{ count: 0 }, { count: 0 }];
      const repository = api.app.get(Database);
      const work = api.app.get(UnitOfWork);
      await Promise.all(
        attempts.map((attempt, index) =>
          work.atomic(async (client) => {
            attempt.count += 1;
            const current = await (client ?? repository).group.findUnique({ where: { id: group.id } });
            if (!current) throw new Error('테스트 그룹이 있어야 한다');
            if (attempt.count === 1) {
              await barrier.arrive();
            }
            await (client ?? repository).group.update({
              where: { id: group.id },
              data: { name: String(Number(current.name) + 1) },
            });
            await recordEvent(client ?? repository, {
              id: `${group.id}:${index}`,
              type: ANALYTICS_EVENT.GROUP_JOINED,
              userId: null,
              properties: { groupId: group.id },
            });
          }),
        ),
      );
      expect((await api.db.group.findUniqueOrThrow({ where: { id: group.id } })).name).toBe('2');
      expect(attempts.reduce((total, item) => total + item.count, 0)).toBeGreaterThanOrEqual(3);
      expect(
        await api.db.analyticsEvent.count({ where: { id: { in: [`${group.id}:0`, `${group.id}:1`] } } }),
      ).toBe(2);
    } finally {
      await api.close();
    }
  });
  it('매 시도마다 실제 충돌이 발생하면 재시도 한도 뒤 CONFLICT로 끝내고 미완료 이벤트를 남기지 않아야 한다', async () => {
    const api = currentApi();
    const group = await api.db.group.create({ data: groupData('initial') });
    const attempts = { count: 0 };
    const groups = api.app.get(Database);
    await expect(
      api.app.get(UnitOfWork).atomic(async (client) => {
        attempts.count += 1;
        await (client ?? groups).group.findUnique({ where: { id: group.id } });
        await recordEvent(client ?? groups, {
          id: group.id,
          type: ANALYTICS_EVENT.GROUP_JOINED,
          userId: null,
          properties: { groupId: group.id },
        });
        // 별도 DB 연결이 다른 요청의 커밋을 재현한다.
        await api.db.group.update({ where: { id: group.id }, data: { name: `external-${attempts.count}` } });
        await (client ?? groups).group.update({ where: { id: group.id }, data: { name: 'must-rollback' } });
      }),
    ).rejects.toMatchObject({ message: ERROR_MESSAGE.REQUEST_CONFLICT, extensions: { code: 'CONFLICT' } });
    expect(attempts.count).toBe(SERIALIZABLE_ATTEMPTS);
    expect((await api.db.group.findUniqueOrThrow({ where: { id: group.id } })).name).toBe(
      `external-${SERIALIZABLE_ATTEMPTS}`,
    );
    expect(await api.db.analyticsEvent.findUnique({ where: { id: group.id } })).toBeNull();
  });
});
