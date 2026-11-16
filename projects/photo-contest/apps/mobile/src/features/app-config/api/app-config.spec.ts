import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAppConfig, type TFetch } from './app-config.api';

const BASE_URL = 'https://contest.example/backend';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch(response: Response) {
  return vi.fn<TFetch>(async () => response);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchAppConfig', () => {
  it('웹 origin 프록시의 /app/config를 읽어 버전 설정을 돌려줘야 한다', async () => {
    const fetchImpl = stubFetch(
      jsonResponse({ minimumVersion: '1.0.0', latestVersion: '1.2.0', extra: true }),
    );

    await expect(fetchAppConfig(BASE_URL, fetchImpl)).resolves.toEqual({
      minimumVersion: '1.0.0',
      latestVersion: '1.2.0',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://contest.example/backend/app/config',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('x.y.z가 아닌 버전이면 거부해야 한다', async () => {
    await expect(
      fetchAppConfig(BASE_URL, stubFetch(jsonResponse({ minimumVersion: '1.0', latestVersion: '1.0.0' }))),
    ).rejects.toThrow();
    await expect(
      fetchAppConfig(BASE_URL, stubFetch(jsonResponse({ minimumVersion: '1.0.0' }))),
    ).rejects.toThrow();
  });

  it('200이 아니면 거부해야 한다', async () => {
    await expect(fetchAppConfig(BASE_URL, stubFetch(jsonResponse({ message: 'down' }, 503)))).rejects.toThrow(
      '503',
    );
  });

  it('JSON이 아니면 거부해야 한다', async () => {
    await expect(fetchAppConfig(BASE_URL, stubFetch(new Response('<html></html>')))).rejects.toThrow();
  });

  it('제한 시간 안에 응답이 없으면 요청을 끊어야 한다', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<TFetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const result = fetchAppConfig(BASE_URL, fetchImpl, { timeoutMs: 5_000 });
    const assertion = expect(result).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(5_000);

    await assertion;
  });
});
