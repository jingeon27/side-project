import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { Database, type TDatabaseClient } from '../../database/database.service';
import { UnitOfWork } from '../../database/unit-of-work';
import * as sentry from '../../monitoring/sentry';
import { AnalyticsModule } from '../analytics.module';
import { COMPLETION_READERS, type TCompletionReaders } from './completion-reader';
import { completionReadersProvider } from './completion-readers.provider';
import { ContestCompletionService } from './contest-completion.service';
import { LegacyCompletionReader } from './legacy-completion.reader';
import { PostCompletionReader } from './post-completion.reader';

function fixture() {
  const client = {
    post: { findMany: vi.fn().mockResolvedValue([{ authorId: 'a' }, { authorId: 'a' }]) },
    postContestVote: { findMany: vi.fn().mockResolvedValue([{ voterId: 'b' }, { voterId: 'c' }]) },
    submission: { findMany: vi.fn().mockResolvedValue([{ authorId: 'd' }]) },
    vote: { findMany: vi.fn().mockResolvedValue([{ voterId: 'd' }]) },
    $executeRaw: vi
      .fn<
        (
          query: TemplateStringsArray,
          hash: string,
          id: string,
          type: string,
          userId: string | null,
          properties: string,
        ) => Promise<number>
      >()
      .mockResolvedValue(1),
    contest: { update: vi.fn().mockResolvedValue({}) },
  };
  const database = {
    contest: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'post', groupId: 'group', format: 'POST' },
        { id: 'legacy', groupId: 'group', format: 'LEGACY' },
      ]),
    },
    atomic: <T>(work: (tx: TDatabaseClient) => Promise<T>) => work(client as unknown as TDatabaseClient),
  };
  @Global()
  @Module({
    providers: [{ provide: Database, useValue: database }, UnitOfWork],
    exports: [Database, UnitOfWork],
  })
  class DatabaseFixtureModule {}
  @Module({ imports: [DatabaseFixtureModule, AnalyticsModule] })
  class FixtureModule {}
  return { client, database, module: FixtureModule };
}

describe('대회 종료 집계 DI', () => {
  it('실제 AnalyticsModule에서 형식별 조회를 같은 tx에 연결하고 기존 종료 이벤트를 기록해야 한다', async () => {
    const { client, module } = fixture();
    const app = await NestFactory.createApplicationContext(module, { logger: false });
    try {
      expect(await app.get(ContestCompletionService).recordCompletedContests()).toBe(2);
      const readers = app.get<TCompletionReaders>(COMPLETION_READERS);
      expect(readers.POST).toBe(app.get(PostCompletionReader));
      expect(readers.LEGACY).toBe(app.get(LegacyCompletionReader));
      expect(client.post.findMany).toHaveBeenCalledWith({
        where: { contestId: 'post', hidden: false },
        select: { authorId: true },
      });
      expect(client.postContestVote.findMany).toHaveBeenCalledWith({
        where: { contestId: 'post', post: { hidden: false } },
        select: { voterId: true },
      });
      expect(client.submission.findMany).toHaveBeenCalledWith({
        where: { contestId: 'legacy', hidden: false },
        select: { authorId: true },
      });
      expect(client.vote.findMany).toHaveBeenCalledWith({
        where: { contestId: 'legacy', submission: { hidden: false } },
        select: { voterId: true },
      });
      expect(
        client.$executeRaw.mock.calls.map(([, , id, type, userId, properties]) => ({
          id,
          type,
          userId,
          properties: JSON.parse(properties),
        })),
      ).toEqual([
        {
          id: 'completed:post',
          type: 'contest_completed',
          userId: null,
          properties: {
            contestId: 'post',
            groupId: 'group',
            submissions: 2,
            votes: 2,
            participants: 3,
            activeContest: true,
          },
        },
        {
          id: 'completed:legacy',
          type: 'contest_completed',
          userId: null,
          properties: {
            contestId: 'legacy',
            groupId: 'group',
            submissions: 1,
            votes: 1,
            participants: 1,
            activeContest: false,
          },
        },
      ]);
      expect(client.contest.update).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('한 대회의 조회가 실패해도 뒤 대회는 기록하고 실패한 대회는 기록하지 않은 채 그 실패를 전파해야 한다', async () => {
    const { client, module } = fixture();
    const failure = new Error('query failed');
    client.post.findMany.mockRejectedValueOnce(failure);
    const report = vi.spyOn(sentry, 'reportUnexpectedError').mockImplementation(() => undefined);
    const app = await NestFactory.createApplicationContext(module, { logger: false });
    try {
      await expect(app.get(ContestCompletionService).recordCompletedContests()).rejects.toBe(failure);
      expect(client.$executeRaw.mock.calls.map(([, , id]) => id)).toEqual(['completed:legacy']);
      expect(client.contest.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'legacy' },
        data: { completionTrackedAt: expect.any(Date) },
      });
      // 전파한 실패는 스케줄러가 보고하므로 여기서 다시 보내지 않는다.
      expect(report).not.toHaveBeenCalled();
    } finally {
      report.mockRestore();
      await app.close();
    }
  });

  it('여러 대회가 실패하면 처음 실패만 전파하고 나머지는 보고해야 한다', async () => {
    const { client, module } = fixture();
    const first = new Error('post query failed');
    const second = new Error('legacy query failed');
    client.post.findMany.mockRejectedValueOnce(first);
    client.submission.findMany.mockRejectedValueOnce(second);
    const report = vi.spyOn(sentry, 'reportUnexpectedError').mockImplementation(() => undefined);
    const app = await NestFactory.createApplicationContext(module, { logger: false });
    try {
      await expect(app.get(ContestCompletionService).recordCompletedContests()).rejects.toBe(first);
      expect(report).toHaveBeenCalledExactlyOnceWith(second, { job: 'maintenance' });
      expect(client.$executeRaw).not.toHaveBeenCalled();
      expect(client.contest.update).not.toHaveBeenCalled();
    } finally {
      report.mockRestore();
      await app.close();
    }
  });

  it('POST가 아닌 기존 문자열 형식은 이전 사진 집계로 처리해야 한다', async () => {
    const { client, database, module } = fixture();
    database.contest.findMany.mockResolvedValueOnce([{ id: 'old', groupId: 'group', format: 'old-format' }]);
    const app = await NestFactory.createApplicationContext(module, { logger: false });
    try {
      expect(await app.get(ContestCompletionService).recordCompletedContests()).toBe(1);
      expect(client.post.findMany).not.toHaveBeenCalled();
      expect(client.submission.findMany).toHaveBeenCalledWith({
        where: { contestId: 'old', hidden: false },
        select: { authorId: true },
      });
    } finally {
      await app.close();
    }
  });

  it('factory는 클래스 토큰의 대체 provider를 새 인스턴스로 바꾸지 않고 사용해야 한다', async () => {
    const post = { read: vi.fn().mockResolvedValue({ submissions: [], votes: [] }) };
    @Module({
      providers: [
        { provide: PostCompletionReader, useValue: post },
        LegacyCompletionReader,
        completionReadersProvider,
      ],
    })
    class OverrideModule {}
    const app = await NestFactory.createApplicationContext(OverrideModule, { logger: false });
    try {
      const readers = app.get<TCompletionReaders>(COMPLETION_READERS);
      expect(readers.POST).toBe(post);
      expect(readers.LEGACY).toBe(app.get(LegacyCompletionReader));
    } finally {
      await app.close();
    }
  });
});
