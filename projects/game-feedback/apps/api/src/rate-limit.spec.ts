import { expect, it } from 'vitest';

import { coarseRateBucket, INTERNAL_READ_LIMIT, requestRateBucket, RequestRateLimiter } from './rate-limit';

it('직접 전송 예약과 기존 업로드는 제한을 공유하고 완료 검증은 별도 예산을 사용해야 한다', () => {
  const limiter = new RequestRateLimiter();
  const identity = { ip: '127.0.0.1', userId: 'owner', method: 'POST' };
  const reserve = requestRateBucket({ ...identity, path: '/api/post-media/uploads' });
  const proxy = requestRateBucket({ ...identity, path: '/api/post-media' });
  const complete = requestRateBucket({ ...identity, path: '/api/post-media/media-1/complete' });
  const chat = requestRateBucket({ ...identity, path: '/api/conversations/room-1/attachments/uploads' });
  const chatComplete = requestRateBucket({
    ...identity,
    path: '/api/conversations/room-1/attachments/file-1/complete',
  });
  Array.from({ length: 20 }).forEach(() => {
    expect(limiter.consume(reserve.key, reserve.limit, 0)).toBe(0);
    expect(limiter.consume(complete.key, complete.limit, 0)).toBe(0);
  });
  expect(limiter.consume(reserve.key, reserve.limit, 0)).toBe(60);
  expect(limiter.consume(proxy.key, proxy.limit, 0)).toBe(60);
  expect(limiter.consume(complete.key, complete.limit, 0)).toBe(60);
  expect(limiter.consume(chat.key, chat.limit, 0)).toBe(60);
  expect(limiter.consume(chatComplete.key, chatComplete.limit, 0)).toBe(60);
  const anotherUser = requestRateBucket({ ...identity, userId: 'peer', path: '/api/post-media/uploads' });
  expect(limiter.consume(anotherUser.key, anotherUser.limit, 0)).toBe(0);
});

it('서명된 내부 조회는 방문자 주소와 분리된 넉넉한 예산을 사용해야 한다', () => {
  const read = { ip: 'internal', internal: true, path: '/api/posts', method: 'GET' };
  expect(requestRateBucket(read)).toEqual({ key: 'read:internal', limit: INTERNAL_READ_LIMIT });
  expect(coarseRateBucket(read)).toEqual({ key: 'coarse:internal', limit: INTERNAL_READ_LIMIT * 2 });
  expect(requestRateBucket({ ...read, method: 'POST' })).toEqual({ key: 'write:internal', limit: 60 });
  const visitor = { ip: '203.0.113.7', path: '/api/posts', method: 'GET' };
  expect(requestRateBucket(visitor)).toEqual({ key: 'read:ip:203.0.113.7', limit: 240 });
  expect(coarseRateBucket(visitor)).toEqual({ key: 'coarse:ip:203.0.113.7', limit: 1000 });
  // 주소 문자열이 우연히 internal이어도 서명된 내부 호출로 취급하지 않는다.
  expect(requestRateBucket({ ...visitor, ip: 'internal' }).key).toBe('read:ip:internal');
});
