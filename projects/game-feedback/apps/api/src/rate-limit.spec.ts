import { expect, it } from 'vitest';

import { coarseRateBucket, INTERNAL_READ_LIMIT, requestRateBucket, RequestRateLimiter } from './rate-limit';

it('게시글·채팅·프로필 예약은 제한을 공유하고 완료 검증은 별도 예산을 사용해야 한다', () => {
  const limiter = new RequestRateLimiter();
  const identity = { ip: '127.0.0.1', userId: 'owner', method: 'POST' };
  const reserve = requestRateBucket({ ...identity, path: '/api/post-media/uploads' });
  const avatar = requestRateBucket({ ...identity, path: '/api/profile/avatar/uploads' });
  const avatarComplete = requestRateBucket({
    ...identity,
    path: '/api/profile/avatar/uploads/file-1/complete',
  });
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
  expect(limiter.consume(avatar.key, avatar.limit, 0)).toBe(60);
  expect(limiter.consume(complete.key, complete.limit, 0)).toBe(60);
  expect(limiter.consume(chat.key, chat.limit, 0)).toBe(60);
  expect(limiter.consume(chatComplete.key, chatComplete.limit, 0)).toBe(60);
  expect(limiter.consume(avatarComplete.key, avatarComplete.limit, 0)).toBe(60);
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

it('게임 프로필 조회는 서버 토큰을 쓰므로 사용자별 전용 예산을 사용해야 한다', () => {
  const lookup = {
    ip: '203.0.113.7',
    userId: 'owner',
    method: 'GET',
    path: '/api/game-profiles/%23P0LYQ829',
  };
  expect(requestRateBucket(lookup)).toEqual({ key: 'game-profile:user:owner', limit: 10 });
  expect(requestRateBucket({ ...lookup, path: '/api/me/game-accounts' }).key).toBe('read:user:owner');
});
