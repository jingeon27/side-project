import type { MessageEvent } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRequest } from '../auth/session.types';
import type { AppConfig } from '../config/app.config';
import type { PrismaClient } from '../generated/prisma';
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
    events.stream(req).subscribe({
      next: (event) => received.push(event),
      complete: () => {
        state.closed = true;
      },
    });
    return { received, state };
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
});
