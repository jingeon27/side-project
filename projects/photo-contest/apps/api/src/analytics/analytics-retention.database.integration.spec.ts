import { randomUUID } from 'node:crypto';

import { afterAll, expect, inject, it } from 'vitest';

import { createDatabaseClient } from '@photo-contest/test-kit';

import { sha256Hex } from '../common/crypto';
import { ANALYTICS_RETENTION_MS } from '../config/limits';
import { ANALYTICS_EVENT } from './analytics-event';
import { recordEvent } from './analytics-event.writer';
import { archiveAnalyticsEvents } from './analytics-retention.repository';

const db = createDatabaseClient(inject('databaseUrl'));
afterAll(() => db.$disconnect());
const now = new Date('2026-10-29T12:00:00Z');
const cutoff = new Date(now.getTime() - ANALYTICS_RETENTION_MS);

it('90일 지난 원본만 UTC 일자·종류별로 집계하고 경계·최근 원본은 보존한다', async () => {
  const type = `retention-${randomUUID()}`;
  const day = new Date('2026-01-01T00:00:00Z');
  await db.analyticsEvent.createMany({
    data: [
      { id: randomUUID(), type, createdAt: day, properties: { old: true } },
      { id: randomUUID(), type, createdAt: new Date('2026-01-01T23:59:59Z'), properties: {} },
      { id: randomUUID(), type, createdAt: new Date('2026-01-02T00:00:00Z'), properties: {} },
      { id: randomUUID(), type, createdAt: cutoff, properties: { keep: true } },
      { id: randomUUID(), type, createdAt: now, properties: { keep: true } },
    ],
  });
  expect(await archiveAnalyticsEvents({ client: db, now })).toBe(3);
  expect(await db.analyticsEvent.count({ where: { type } })).toBe(2);
  expect(await db.analyticsDailySummary.findMany({ where: { type }, orderBy: { day: 'asc' } })).toMatchObject(
    [
      { day, eventCount: 2n },
      { day: new Date('2026-01-02T00:00:00Z'), eventCount: 1n },
    ],
  );
  expect(await archiveAnalyticsEvents({ client: db, now })).toBe(0);
});

it('원본을 지운 뒤 같은 id를 재시도해도 다시 기록·집계하지 않는다', async () => {
  const event = {
    id: randomUUID(),
    type: ANALYTICS_EVENT.POST_LIKED,
    userId: null,
    properties: { postId: 'old-post' },
  };
  await Promise.all([recordEvent(db, event), recordEvent(db, event)]);
  expect(await db.analyticsEvent.count({ where: { id: event.id } })).toBe(1);
  await db.analyticsEvent.update({ where: { id: event.id }, data: { createdAt: new Date('2026-02-01') } });
  expect(await archiveAnalyticsEvents({ client: db, now })).toBe(1);
  await recordEvent(db, event);
  expect(await db.analyticsEvent.findUnique({ where: { id: event.id } })).toBeNull();
  expect(await db.analyticsEventReceipt.findUnique({ where: { keyHash: sha256Hex(event.id) } })).toEqual({
    keyHash: sha256Hex(event.id),
  });
});

it('집계와 삭제가 함께 롤백되고 동시 배치도 같은 원본을 두 번 세지 않는다', async () => {
  const type = `retention-${randomUUID()}`;
  const day = new Date('2026-03-01');
  await db.analyticsEvent.createMany({
    data: Array.from({ length: 6 }, () => ({ id: randomUUID(), type, createdAt: day, properties: {} })),
  });
  await expect(
    db.$transaction(async (tx) => {
      await archiveAnalyticsEvents({ client: tx, now, batchSize: 2 });
      throw new Error('rollback archive');
    }),
  ).rejects.toThrow('rollback archive');
  expect(await db.analyticsEvent.count({ where: { type } })).toBe(6);
  expect(await db.analyticsDailySummary.count({ where: { type } })).toBe(0);
  const removed = await Promise.all(
    Array.from({ length: 3 }, () => archiveAnalyticsEvents({ client: db, now, batchSize: 2 })),
  );
  expect(removed.reduce((sum, count) => sum + count, 0)).toBe(6);
  expect(await db.analyticsDailySummary.findUnique({ where: { day_type: { day, type } } })).toMatchObject({
    eventCount: 6n,
  });
  expect(await db.analyticsEvent.count({ where: { type } })).toBe(0);
});
