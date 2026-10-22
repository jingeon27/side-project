import { firstValueFrom, Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../common/http/api-error';
import { ConcurrencyLimit, MediaWorkInterceptor, type MediaWorkLimiter } from './media-work';

describe('media work concurrency', () => {
  it('runs up to the limit, queues the next requests in order and hands slots over on release', async () => {
    const limit = new ConcurrencyLimit(2, 2);
    const first = await limit.acquire();
    const second = await limit.acquire();
    const order: string[] = [];
    const third = limit.acquire().then((release) => {
      order.push('third');
      return release;
    });
    const fourth = limit.acquire().then((release) => {
      order.push('fourth');
      return release;
    });
    expect(limit.usage).toEqual({ active: 2, waiting: 2 });
    first();
    first();
    (await third)();
    second();
    (await fourth)();
    expect(order).toEqual(['third', 'fourth']);
    expect(limit.usage).toEqual({ active: 0, waiting: 0 });
  });

  it('rejects instead of waiting when the queue is full', async () => {
    const limit = new ConcurrencyLimit(1, 1);
    const running = await limit.acquire();
    const queued = limit.acquire();
    const error = await limit.acquire().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, response: { errorCode: 'MEDIA_BUSY' } });
    running();
    (await queued)();
    expect(limit.usage).toEqual({ active: 0, waiting: 0 });
  });

  it('holds the slot until the handler finishes, including failures', async () => {
    const limit = new ConcurrencyLimit(1, 0);
    const interceptor = new MediaWorkInterceptor(limit as MediaWorkLimiter);
    const failing = interceptor.intercept({} as never, {
      handle: () =>
        new Observable((subscriber) => {
          expect(limit.usage.active).toBe(1);
          subscriber.error(new Error('multer failed'));
        }),
    });
    await expect(firstValueFrom(failing)).rejects.toThrow('multer failed');
    expect(limit.usage).toEqual({ active: 0, waiting: 0 });
    const done = interceptor.intercept({} as never, {
      handle: () => new Observable((subscriber) => subscriber.next('stored')),
    });
    await expect(firstValueFrom(done)).resolves.toBe('stored');
  });
});
