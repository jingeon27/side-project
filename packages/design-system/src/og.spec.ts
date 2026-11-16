import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSocialPreviewImage, socialPreviewText } from './og';

vi.mock('next/og', () => ({ ImageResponse: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('social preview text and media boundaries', () => {
  it('normalizes Korean composition, strips control characters and avoids splitting surrogate pairs', () => {
    expect(socialPreviewText('한글\n🏆  프로필', 20)).toBe('한글 프로필');
    expect(socialPreviewText('아주 긴 제목입니다', 6)).toBe('아주 긴 …');
  });
  it('reads only bounded image responses without forwarding a user session', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png', 'content-length': '3' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await readSocialPreviewImage(new URL('https://media.example/owned'))).toBe(
      'data:image/png;base64,AQID',
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('headers');
  });
  const invalidHeaders: Record<string, string>[] = [
    { 'content-type': 'text/html', 'content-length': '3' },
    { 'content-type': 'image/png', 'content-length': '20000000' },
    { 'content-type': 'image/png' },
  ];
  it.each(invalidHeaders)('falls back for unsupported or unbounded media %o', async (headers) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { headers })));
    expect(await readSocialPreviewImage(new URL('https://media.example/owned'))).toBeNull();
  });
  it('falls back when media is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await readSocialPreviewImage(new URL('https://media.example/owned'))).toBeNull();
  });
});
