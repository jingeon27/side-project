import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { apiFetch } from './http';
import {
  ApiError,
  ApiResponseValidationError,
  completeChatAttachmentUpload,
  getGameProfile,
  getHealth,
  getPost,
  getPublicProfile,
  getSession,
  listCategories,
  listChatMessages,
  logout,
} from './index';
import { messagesFixture, postFixture, profileFixture, sessionFixture } from './test/fixtures';

function respond(payload: unknown, status = 200) {
  const fetcher = vi.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe('generated REST client response validation', () => {
  it.each([undefined, -1, '1'])(
    'rejects an invalid view count without inventing a counter: %s',
    async (viewCount) => {
      const fixture = postFixture();
      respond({ ...fixture, post: { ...fixture.post, viewCount } });
      await expect(getPost('post-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    },
  );
  it('validates completed S3 metadata and keeps session credentials on API calls', async () => {
    const attachment = {
      id: 'attachment-1',
      name: 'test.png',
      mimeType: 'image/png',
      size: 12,
      kind: 'IMAGE',
      url: '/api/conversations/room-1/attachments/attachment-1',
    };
    const fetcher = respond(attachment);
    expect(await completeChatAttachmentUpload('room-1', 'attachment-1')).toEqual(attachment);
    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.body).toBeUndefined();
    expect(new Headers(request?.headers).has('Content-Type')).toBe(false);
    expect(request?.credentials).toBe('include');
    respond({ ...attachment, url: 'https://untrusted.example/private' });
    await expect(completeChatAttachmentUpload('room-1', 'attachment-1')).rejects.toBeInstanceOf(
      ApiResponseValidationError,
    );
  });
  it('keeps existing titles longer than the new write limit readable', async () => {
    const fixture = postFixture();
    const title = '제'.repeat(120);
    respond({ ...fixture, post: { ...fixture.post, title } });
    expect((await getPost('post-1')).post.title).toBe(title);
  });
  it('validates public profiles and strips undeclared private fields', async () => {
    const profile = {
      author: postFixture().post.author,
      joinedAt: '2026-10-17T00:00:00.000Z',
      postCount: 2,
      answerCount: 3,
      helpfulCount: 1,
    };
    respond({ ...profile, role: 'ADMIN', googleSubject: 'must-not-pass-through' });
    expect(await getPublicProfile('player-1')).toEqual(profile);
    respond({ ...profile, author: { ...profile.author, id: 42 } });
    await expect(getPublicProfile('player-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('uses a per-request server origin without leaking transport options or changing browser requests', async () => {
    const fixture = sessionFixture();
    const fetcher = respond(fixture);
    await getSession({
      baseUrl: 'https://api.example',
      headers: { Cookie: 'gamefeedback_session=test-only' },
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example/api/session');
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('baseUrl');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Cookie')).toBe(
      'gamefeedback_session=test-only',
    );
    await getSession();
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/session');
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).has('Cookie')).toBe(false);
  });
  it('returns parsed data, strips unknown keys and keeps credentials, headers and AbortSignal', async () => {
    const fixture = sessionFixture();
    const fetcher = respond({ ...fixture, unexpected: 'discard me' });
    const controller = new AbortController();
    expect(await getSession({ signal: controller.signal, headers: { 'X-Test': 'rest' } })).toEqual(fixture);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', signal: controller.signal });
    expect(init).not.toHaveProperty('schema');
    expect(new Headers(init?.headers).get('X-Test')).toBe('rest');
  });
  it.each([
    ['missing user ID', { ...sessionFixture(), user: { ...sessionFixture().user, id: undefined } }],
    ['empty user ID', { ...sessionFixture(), user: { ...sessionFixture().user, id: '' } }],
    ['object user ID', { ...sessionFixture(), user: { ...sessionFixture().user, id: { unexpected: true } } }],
    ['unknown role', { ...sessionFixture(), user: { ...sessionFixture().user, role: 'SUPER_ADMIN' } }],
    ['string session flag', { ...sessionFixture(), demoMode: 'false' }],
    ['invalid user record', { ...sessionFixture(), user: 'logged in' }],
    [
      'invalid timestamp',
      { ...sessionFixture(), user: { ...sessionFixture().user, createdAt: 'yesterday' } },
    ],
  ])('rejects %s without passing an unsafe session to the app', async (_name, payload) => {
    respond(payload);
    await expect(getSession()).rejects.toMatchObject({
      name: 'ApiResponseValidationError',
      errorCode: 'INVALID_API_RESPONSE',
      status: 200,
    });
  });
  it('does not allow caller options to replace the generated response schema', async () => {
    respond({ ok: true });
    await expect(getSession({ schema: z.unknown() })).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('supports anonymous sessions without inventing a user', async () => {
    const fixture = { ...sessionFixture(), user: null };
    respond(fixture);
    expect(await getSession()).toEqual(fixture);
  });
  it.each(['#GG829JGY', '#AB12CD34', '#P0LYQ829G'])(
    'preserves the full alphanumeric tag %s in session responses',
    async (supercellTag) => {
      const fixture = sessionFixture();
      respond({ ...fixture, user: { ...fixture.user, supercellTag } });
      expect((await getSession()).user?.supercellTag).toBe(supercellTag);
    },
  );
  it('normalizes nested display fields and badge counts while preserving valid siblings', async () => {
    const fixture = postFixture();
    respond({
      ...fixture,
      post: {
        ...fixture.post,
        answerCount: '5',
        helpfulCount: -1,
        author: { ...fixture.post.author, nickname: {}, isVerified: 'false', supercellTag: 123 },
        category: { ...fixture.post.category, name: null },
        gameProfile: {
          ...fixture.post.gameProfile,
          clan: { name: 'bad' },
          deck: [{ id: 26000021, level: 12, name: false, iconUrl: 'javascript:alert(1)' }],
        },
      },
    });
    const result = await getPost('post-1');
    expect(result.post).toMatchObject({
      id: 'post-1',
      title: fixture.post.title,
      body: fixture.post.body,
      answerCount: 0,
      helpfulCount: 0,
      author: { id: 'player-1', nickname: '알 수 없는 플레이어', isVerified: false, supercellTag: null },
      category: { name: '이름 없음' },
      gameProfile: { clan: null, deck: [{ id: 26000021, level: 12, name: '이름 없음', iconUrl: null }] },
    });
    expect(result.answers).toEqual(fixture.answers);
  });
  it('preserves friend sale prices and legacy omissions while rejecting malformed money without fallback', async () => {
    const fixture = postFixture();
    for (const friendSale of [undefined, null, { price: null }, { price: 12000 }]) {
      respond({ ...fixture, post: { ...fixture.post, board: 'FRIEND_SALE', friendSale } });
      expect((await getPost('post-1')).post.friendSale).toEqual(friendSale);
    }
    for (const price of ['12000', 0, -1, 1.5, 10000001, false]) {
      respond({ ...fixture, post: { ...fixture.post, board: 'FRIEND_SALE', friendSale: { price } } });
      await expect(getPost('post-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    }
  });
  it('validates coaching periods, goals and amounts without a money or target fallback', async () => {
    const fixture = postFixture();
    for (const pricing of [
      { type: 'HOURLY', amount: 35000 },
      { type: 'MONTHLY', amount: null },
      { type: 'GOAL', amount: 500000, targetScore: '9000' },
    ]) {
      const coaching = { role: 'STUDENT', pricing };
      respond({ ...fixture, post: { ...fixture.post, board: 'COACHING', coaching } });
      expect((await getPost('post-1')).post.coaching).toEqual(coaching);
    }
    for (const pricing of [
      { type: 'MONTHLY', amount: '35000' },
      { type: 'HOURLY', amount: -1 },
      { type: 'GOAL', amount: null },
      { type: 'GOAL', amount: 500000, targetScore: 9000 },
      { type: 'GOAL', amount: 500000, targetScore: '' },
      { type: 'OTHER', amount: 35000 },
    ]) {
      respond({
        ...fixture,
        post: { ...fixture.post, board: 'COACHING', coaching: { role: 'COACH', pricing } },
      });
      await expect(getPost('post-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    }
  });
  it('fills only explicitly allowed missing display fields', async () => {
    const fixture = postFixture();
    const without = (value: object, omitted: string) =>
      Object.fromEntries(Object.entries(value).filter(([key]) => key !== omitted));
    respond({
      ...fixture,
      post: { ...without(fixture.post, 'answerCount'), author: without(fixture.post.author, 'nickname') },
    });
    const result = await getPost('post-1');
    expect(result.post.answerCount).toBe(0);
    expect(result.post.author.nickname).toBe('알 수 없는 플레이어');
  });
  it.each([
    null,
    {},
    { items: null, nextCursor: null },
    { items: [], nextCursor: '' },
    { items: [], nextCursor: 42 },
  ])('rejects malformed list envelopes or cursors: %j', async (payload) => {
    respond(payload);
    await expect(listChatMessages('room-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('keeps chat identities, message order, content and read boundaries strict', async () => {
    const fixture = messagesFixture();
    respond({ ...fixture, conversation: { ...fixture.conversation, unreadCount: null } });
    expect((await listChatMessages('room-1')).conversation.unreadCount).toBe(0);
    for (const patch of [
      { id: '' },
      { body: null },
      { createdAt: 'bad-date' },
      { clientMessageId: 'not-a-uuid' },
    ]) {
      respond({ ...fixture, items: [{ ...fixture.items[0], ...patch }] });
      await expect(listChatMessages('room-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    }
    respond({ ...fixture, conversation: { ...fixture.conversation, peerLastReadAt: 'bad-date' } });
    await expect(listChatMessages('room-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('validates bare array responses without erasing malformed entries', async () => {
    respond([{ id: 'clash-royale', slug: 'clash-royale', name: null, active: true }]);
    expect(await listCategories()).toEqual([
      { id: 'clash-royale', slug: 'clash-royale', name: '이름 없음', active: true },
    ]);
    respond([{ id: '', slug: 'clash-royale', name: '클래시로얄', active: true }]);
    await expect(listCategories()).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('preserves valid game data but rejects false source or ownership claims', async () => {
    const profile = profileFixture();
    respond(profile);
    expect(await getGameProfile('GG829JGY')).toEqual(profile);
    for (const patch of [{ source: 'UNKNOWN' }, { verification: 'VERIFIED' }, { trophies: '7000' }]) {
      respond({ ...profile, ...patch });
      await expect(getGameProfile('GG829JGY')).rejects.toBeInstanceOf(ApiResponseValidationError);
    }
  });
  it('does not turn a failed or empty mutation response into success', async () => {
    respond({ ok: false });
    await expect(logout()).rejects.toBeInstanceOf(ApiResponseValidationError);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(logout()).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
  it('requires a schema before a raw request can be made', async () => {
    const fetcher = respond({ ok: true });
    await expect(apiFetch('/api/health')).rejects.toMatchObject({ errorCode: 'RESPONSE_SCHEMA_REQUIRED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('reports malformed JSON without retaining raw response data in the exception', async () => {
    const raw = '<html>private response body</html>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(raw, { status: 200 })),
    );
    const failure = await getHealth().catch((error) => error);
    expect(failure).toBeInstanceOf(ApiResponseValidationError);
    expect(JSON.stringify(failure)).not.toContain(raw);
    const fixture = messagesFixture();
    respond({ ...fixture, items: [{ ...fixture.items[0], body: { secret: 'private message' } }] });
    const invalid = await listChatMessages('room-1').catch((error) => error);
    expect(invalid).toBeInstanceOf(ApiResponseValidationError);
    expect(JSON.stringify(invalid)).not.toContain('private message');
    expect(invalid.issues.length).toBeGreaterThan(0);
  });
});

describe('HTTP failures and cancellation', () => {
  it('validates error payloads while retaining the HTTP status and stable server code', async () => {
    respond({ errorCode: 'AUTH_REQUIRED', message: '로그인해주세요.' }, 401);
    await expect(getSession()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      errorCode: 'AUTH_REQUIRED',
      message: '로그인해주세요.',
    });
    respond({ errorCode: { unexpected: true }, message: 42 }, 503);
    await expect(getSession()).rejects.toMatchObject({
      status: 503,
      errorCode: 'REQUEST_FAILED',
      message: '요청을 처리하지 못했습니다.',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failure', { status: 502 })),
    );
    await expect(getSession()).rejects.toMatchObject({ status: 502, errorCode: 'REQUEST_FAILED' });
  });
  it('preserves network and request/body cancellation failures as the original errors', async () => {
    const network = new TypeError('Failed to fetch');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw network;
      }),
    );
    await expect(getHealth()).rejects.toBe(network);
    const aborted = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw aborted;
      }),
    );
    await expect(getHealth()).rejects.toBe(aborted);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw aborted;
        },
      })),
    );
    await expect(getHealth()).rejects.toBe(aborted);
  });
  it('keeps schema failures compatible with existing API error handling', () => {
    expect(new ApiResponseValidationError(200)).toBeInstanceOf(ApiError);
  });
});

describe('battle response metadata', () => {
  it.each([{ mode: 'RAID' }, { mode: 1 }, 'TEAM'])(
    'rejects invalid battle metadata instead of falling back: %j',
    async (battle) => {
      const fixture = postFixture();
      respond({ ...fixture, post: { ...fixture.post, battle } });
      await expect(getPost('post-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    },
  );
});
