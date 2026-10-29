import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordSentryRelease } from './sentry-release';

// Sentry의 공개 웹훅 테스트 fixture와 프로젝트 123으로 만든 서명.
const settings = {
  SENTRY_RELEASE_TOKEN: 'a2587e3af83411e4a28634363b8514c2',
  SENTRY_PROJECT_ID: '123',
  SENTRY_PROJECT: 'test-server',
  SENTRY_RELEASE: 'a'.repeat(40),
  GITHUB_REPOSITORY: 'example/project',
};
const signature = 'de285c0dd16b7ec5b7a51d7570ce1e63d7b0dc090da4a51e97f6b283aa846e64';

afterEach(() => vi.useRealTimers());

describe('프로젝트 Releases 웹훅', () => {
  it('토큰이 없으면 외부 요청 없이 건너뛰어야 한다', async () => {
    const request = vi.fn<typeof fetch>();
    expect(await recordSentryRelease({ ...settings, SENTRY_RELEASE_TOKEN: '' }, request)).toEqual({
      skipped: true,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([201, 208])('새 릴리스와 기존 릴리스(%i)에 같은 배포 커밋을 등록해야 한다', async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    await recordSentryRelease(settings, request);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] ?? [];
    expect(url).toBe(`https://us.sentry.io/api/hooks/release/builtin/123/${signature}/`);
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(String(options?.body))).toEqual({
      version: settings.SENTRY_RELEASE,
      url: `https://github.com/example/project/commit/${settings.SENTRY_RELEASE}`,
      dateReleased: '2026-10-30T00:00:00.000Z',
    });
  });

  it.each([
    'SENTRY_RELEASE_TOKEN',
    'SENTRY_PROJECT_ID',
    'SENTRY_PROJECT',
    'SENTRY_RELEASE',
    'GITHUB_REPOSITORY',
  ])('%s가 잘못되면 외부 요청을 보내지 않아야 한다', async (key) => {
    const request = vi.fn<typeof fetch>();
    await expect(recordSentryRelease({ ...settings, [key]: '../invalid' }, request)).rejects.toThrow(
      'Invalid Sentry release webhook settings.',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('웹훅 실패 응답의 내용이나 비밀 URL을 출력하지 않아야 한다', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(signature, { status: 403 }));
    await expect(recordSentryRelease(settings, request)).rejects.toThrow(
      /^Sentry release request failed \(HTTP 403\)\.$/,
    );
  });

  it('네트워크 오류에 비밀 URL이 있어도 정리된 오류만 반환해야 한다', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(signature));
    await expect(recordSentryRelease(settings, request)).rejects.toThrow(/^Sentry release request failed\.$/);
  });
});
