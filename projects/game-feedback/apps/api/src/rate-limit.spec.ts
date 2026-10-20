import { expect, it } from 'vitest';
import { RequestRateLimiter, requestRateBucket } from './rate-limit';

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
