import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUploadTimeoutMs, StorageUploadError, uploadToStorage } from './upload-to-storage.helper';

const NOW = Date.parse('2026-10-22T00:00:00.000Z');
const ticket = (expiresInMs: number) => ({
  url: 'https://storage.example/bucket',
  fields: [],
  expiresAt: new Date(NOW + expiresInMs).toISOString(),
});

/** 응답 없이 기다리다 신호가 끊기면(이미 끊겼으면 바로) 브라우저처럼 AbortError로 거절한다. */
function stallingFetch() {
  const send = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (init?.signal?.aborted) abort();
        init?.signal?.addEventListener('abort', abort);
      }),
  );
  vi.stubGlobal('fetch', send);
  return send;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('uploadToStorage', () => {
  it('부르는 쪽 신호가 끊기면 전송을 멈추고 폼 오류가 아닌 취소로 끝나야 한다', async () => {
    const send = stallingFetch();
    const controller = new AbortController();
    const upload = uploadToStorage(ticket(60_000), new Blob(['image']), { signal: controller.signal });
    controller.abort();
    const error: unknown = await upload.catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(StorageUploadError);
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('이미 끊긴 신호로는 응답을 기다리지 않아야 한다', async () => {
    stallingFetch();
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadToStorage(ticket(60_000), new Blob(['image']), { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('티켓이 만료될 때까지 응답이 없으면 시간 초과를 폼 오류로 알려야 한다', async () => {
    vi.useFakeTimers({ now: NOW });
    const send = stallingFetch();
    const upload = uploadToStorage(ticket(5 * 60_000), new Blob(['image']));
    const settled = upload.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const error = await settled;
    expect(error).toBeInstanceOf(StorageUploadError);
    expect(error).toHaveProperty('message', expect.stringContaining('시간이 너무 오래'));
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe('getUploadTimeoutMs', () => {
  it('티켓 만료까지 기다리되 기기 시계가 어긋나도 1분~15분 안에 둬야 한다', () => {
    expect(getUploadTimeoutMs(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe(5 * 60_000);
    expect(getUploadTimeoutMs(new Date(NOW - 60 * 60_000).toISOString(), NOW)).toBe(60_000);
    expect(getUploadTimeoutMs(new Date(NOW + 24 * 60 * 60_000).toISOString(), NOW)).toBe(15 * 60_000);
    expect(getUploadTimeoutMs('not-a-date', NOW)).toBe(15 * 60_000);
  });
});
