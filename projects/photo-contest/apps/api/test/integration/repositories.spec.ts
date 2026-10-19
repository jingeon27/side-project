import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';

import { ANALYTICS_EVENT } from '../../src/analytics/analytics-event';
import { AuthRepository } from '../../src/auth/auth.repository';
import { UnitOfWork } from '../../src/database/unit-of-work';
import { GroupRepository } from '../../src/group/group.repository';
import { createTestApp } from '../support/app';
import type { ITestApi } from '../support/app';

describe('Repository transaction boundaries', () => {
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

  it('uses one connection across domains and rolls back writes and analytics together', async () => {
    const api = state.api;
    if (!api) throw new Error('Test application was not initialized');
    const auth = api.app.get(AuthRepository);
    const groups = api.app.get(GroupRepository);
    const work = api.app.get(UnitOfWork);
    await expect(
      work.atomic(async (client) => {
        await auth.createUser(
          { data: { id: userId, nickname: 'Repository 회원', provider: 'test', providerId: userId } },
          client,
        );
        await groups.createGroup(
          {
            data: {
              id: groupId,
              name: 'Repository 그룹',
              inviteToken: groupId,
              inviteHash: groupId,
              members: { create: { userId, role: 'OWNER' } },
            },
          },
          client,
        );
        await groups.recordEvent(client, {
          id: eventId,
          type: ANALYTICS_EVENT.GROUP_CREATED,
          userId,
          properties: { groupId },
        });
        expect(
          await groups.findUniqueGroupMember({ where: { groupId_userId: { groupId, userId } } }, client),
        ).toMatchObject({ userId, groupId });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await api.db.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await api.db.group.findUnique({ where: { id: groupId } })).toBeNull();
    expect(await api.db.groupMember.count({ where: { groupId, userId } })).toBe(0);
    expect(await api.db.analyticsEvent.findUnique({ where: { id: eventId } })).toBeNull();
  });
});
