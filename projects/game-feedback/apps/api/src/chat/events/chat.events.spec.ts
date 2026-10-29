import type { MessageEvent } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { SessionRequest } from '../../auth/session/session.types';
import type { AppConfig } from '../../config/app.config';
import type { PrismaClient } from '../../generated/prisma';
import { sentryOptions } from '../../monitoring/sentry';
import {
  CHAT_EVENTS_HEARTBEAT_MS,
  ChatEvents,
  MAX_STREAMS_PER_SESSION,
  MAX_STREAMS_PER_USER,
} from './chat.events';

type TSessionRow = { tokenHash: string; userId: string; expiresAt: Date; user: { demoKey: null } };

function setup() {
  const sessions = new Map<string, TSessionRow>();
  const findMany = vi.fn(async ({ where }: { where: { tokenHash: { in: string[] } } }) =>
    where.tokenHash.in.flatMap((tokenHash) => sessions.get(tokenHash) ?? []),
  );
  const events = new ChatEvents(
    { session: { findMany } } as unknown as PrismaClient,
    {
      demoMode: false,
      testAuthEnabled: false,
    } as AppConfig,
  );
  function signIn(tokenHash: string, userId: string) {
    sessions.set(tokenHash, {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + 3_600_000),
      user: { demoKey: null },
    });
  }
  function open(tokenHash: string, userId: string) {
    const received: MessageEvent[] = [];
    const state = { closed: false };
    const req = { gfSession: { tokenHash, user: { id: userId } } } as unknown as SessionRequest;
    const subscription = events.stream(req).subscribe({
      next: (event) => received.push(event),
      complete: () => {
        state.closed = true;
      },
    });
    return { received, state, subscription };
  }
  return { events, sessions, findMany, signIn, open };
}

describe('chat event streams', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('closes the oldest stream of a user beyond the per-user cap across sessions', () => {
    const { events, signIn, open } = setup();
    const streams = Array.from({ length: MAX_STREAMS_PER_USER }, (_, index) => {
      const tokenHash = `session-${Math.floor(index / MAX_STREAMS_PER_SESSION)}`;
      signIn(tokenHash, 'user-1');
      return open(tokenHash, 'user-1');
    });
    signIn('session-new', 'user-1');
    const other = open('session-other', 'user-2');
    expect(streams.every(({ state }) => !state.closed)).toBe(true);
    open('session-new', 'user-1');
    expect(streams.map(({ state }) => state.closed)).toEqual([
      true,
      ...Array.from({ length: MAX_STREAMS_PER_USER - 1 }, () => false),
    ]);
    expect(other.state.closed).toBe(false);
    events.onModuleDestroy();
  });

  it('still closes the oldest stream of one session at the per-session cap', () => {
    const { events, signIn, open } = setup();
    signIn('shared', 'user-1');
    const streams = Array.from({ length: MAX_STREAMS_PER_SESSION + 1 }, () => open('shared', 'user-1'));
    expect(streams.map(({ state }) => state.closed)).toEqual([
      true,
      ...Array.from({ length: MAX_STREAMS_PER_SESSION }, () => false),
    ]);
    events.onModuleDestroy();
  });

  it('re-checks every open stream with one session query per tick and closes revoked sessions', async () => {
    const { events, sessions, findMany, signIn, open } = setup();
    signIn('alive', 'user-1');
    signIn('revoked', 'user-2');
    const alive = [open('alive', 'user-1'), open('alive', 'user-1')];
    const revoked = [open('revoked', 'user-2'), open('revoked', 'user-2')];
    await vi.advanceTimersByTimeAsync(0);
    findMany.mockClear();
    sessions.delete('revoked');
    await vi.advanceTimersByTimeAsync(CHAT_EVENTS_HEARTBEAT_MS);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where.tokenHash.in.sort()).toEqual(['alive', 'revoked']);
    expect(alive.every(({ state, received }) => !state.closed && received.at(-1)?.type === 'heartbeat')).toBe(
      true,
    );
    expect(revoked.every(({ state }) => state.closed)).toBe(true);
    events.closeAll();
    findMany.mockClear();
    await vi.advanceTimersByTimeAsync(CHAT_EVENTS_HEARTBEAT_MS * 2);
    // No streams left, so the shared timer stopped querying.
    expect(findMany).not.toHaveBeenCalled();
  });

  describe('SSE 운영 메트릭', () => {
    const samples: string[] = [];
    const metricEnvelope = z.tuple([
      z.unknown(),
      z.array(z.tuple([z.object({ type: z.string() }), z.unknown()])),
    ]);
    const metricSchema = z.object({
      name: z.string(),
      value: z.number(),
      attributes: z.record(z.string(), z.object({ value: z.unknown() })),
    });
    const captured = () =>
      samples.flatMap((raw) =>
        metricEnvelope
          .parse(JSON.parse(raw))[1]
          .flatMap(([header, payload]) =>
            header.type === 'trace_metric'
              ? z.object({ items: z.array(metricSchema) }).parse(payload).items
              : [],
          ),
      );

    beforeEach(() => {
      samples.length = 0;
      vi.stubEnv('SENTRY_DSN', 'https://test@sentry.invalid/1');
      Sentry.init({
        ...sentryOptions(),
        tracesSampleRate: 0,
        transport: () => ({
          send: async (envelope) => {
            samples.push(JSON.stringify(envelope));
            return { statusCode: 200 };
          },
          flush: async () => true,
        }),
      });
    });
    afterEach(async () => {
      vi.useRealTimers();
      await Sentry.close(1000);
      vi.unstubAllEnvs();
    });

    it('연결·브라우저 종료·세션 종료·사용자 종료·서버 종료를 한 번씩 세고 활성 수를 0으로 돌린다', async () => {
      const { events, signIn, open } = setup();
      signIn('private-session', 'private-user');
      const first = open('private-session', 'private-user');
      await vi.advanceTimersByTimeAsync(0);
      first.subscription.unsubscribe();
      open('private-session', 'private-user');
      events.closeSession('private-session');
      open('private-session', 'private-user');
      events.closeUser('private-user');
      open('private-session', 'private-user');
      events.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
      await Sentry.flush(1000);
      const metrics = captured();
      expect(metrics.filter((metric) => metric.name === 'chat.sse.opened')).toHaveLength(4);
      expect(
        metrics
          .filter((metric) => metric.name === 'chat.sse.closed')
          .map((metric) => metric.attributes.reason?.value),
      ).toEqual(['client_disconnect', 'session_closed', 'user_closed', 'server_shutdown']);
      expect(metrics.filter((metric) => metric.name === 'chat.sse.active').at(-1)?.value).toBe(0);
      expect(samples.join('\n')).not.toContain('private');
    });

    it('heartbeat의 DB 장애를 배치 실패 1건과 연결별 종료로 구분하고 활성 연결을 남기지 않는다', async () => {
      const { events, signIn, open, findMany } = setup();
      signIn('private-session', 'private-user');
      const streams = [open('private-session', 'private-user'), open('private-session', 'private-user')];
      await vi.advanceTimersByTimeAsync(0);
      findMany.mockRejectedValueOnce(new Error('private-query'));
      await vi.advanceTimersByTimeAsync(CHAT_EVENTS_HEARTBEAT_MS);
      expect(streams.every(({ state }) => state.closed)).toBe(true);
      events.onModuleDestroy();
      vi.useRealTimers();
      await Sentry.flush(1000);
      const metrics = captured();
      expect(metrics.filter((metric) => metric.name === 'chat.operation.failures')).toMatchObject([
        { value: 1, attributes: { operation: { value: 'chat.heartbeat' }, outcome: { value: 'failed' } } },
      ]);
      expect(
        metrics
          .filter((metric) => metric.name === 'chat.sse.closed')
          .map((metric) => metric.attributes.reason?.value),
      ).toEqual(['heartbeat_failed', 'heartbeat_failed']);
      expect(metrics.filter((metric) => metric.name === 'chat.sse.active').at(-1)?.value).toBe(0);
      expect(samples.join('\n')).not.toContain('private');
    });
  });
});
