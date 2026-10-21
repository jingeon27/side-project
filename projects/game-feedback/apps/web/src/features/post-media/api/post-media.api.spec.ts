import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadMedia } from './post-media.api';

const file = new File(['image-content'], '사진.png', { type: 'image/png' });
const media = {
  id: 'media-1',
  name: file.name,
  mimeType: file.type,
  size: file.size,
  kind: 'IMAGE',
  url: '/api/post-media/media-1',
};
const plan = {
  mode: 'DIRECT',
  id: media.id,
  url: 'https://uploads.example.test/bucket',
  fields: { key: 'staging/object', policy: 'signed-policy' },
  expiresAt: '2026-10-21T12:00:00.000Z',
};
afterEach(() => vi.unstubAllGlobals());

describe('게시글 첨부 전송', () => {
  it('파일은 S3에만 보내고 검증 완료 뒤 고정 미디어 주소를 받아야 한다', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (url === '/api/post-media/uploads') return Response.json(plan);
        if (url === plan.url) return new Response(null, { status: 204 });
        if (url === '/api/post-media/media-1/complete') return Response.json(media);
        throw new Error('Unexpected request');
      }),
    );
    expect(await uploadMedia(file)).toEqual(media);
    expect(requests.map((request) => request.url)).toEqual([
      '/api/post-media/uploads',
      plan.url,
      '/api/post-media/media-1/complete',
    ]);
    const direct = requests[1]?.init;
    expect(direct?.credentials).toBe('omit');
    expect(direct?.referrerPolicy).toBe('no-referrer');
    expect(direct?.redirect).toBe('error');
    const body = direct?.body;
    if (!(body instanceof FormData)) throw new Error('Expected multipart S3 upload');
    expect([...body.keys()]).toEqual(['key', 'policy', 'file']);
    expect(body.get('file')).toBeInstanceOf(File);
  });

  it('로컬 저장소는 기존 multipart 업로드로 처리해야 한다', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url === '/api/post-media/uploads') return Response.json({ mode: 'PROXY' });
        if (url === '/api/post-media') return Response.json(media);
        throw new Error('Unexpected request');
      }),
    );
    expect(await uploadMedia(file)).toEqual(media);
    expect(urls).toEqual(['/api/post-media/uploads', '/api/post-media']);
  });

  it('S3 전송이 실패하면 확정하지 않고 예약을 정리해야 한다', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url === '/api/post-media/uploads') return Response.json(plan);
        if (url === plan.url) return new Response(null, { status: 403 });
        if (url === '/api/post-media/media-1') return Response.json({ ok: true });
        throw new Error('Unexpected request');
      }),
    );
    await expect(uploadMedia(file)).rejects.toMatchObject({ errorCode: 'UPLOAD_FAILED' });
    expect(urls).toEqual(['/api/post-media/uploads', plan.url, '/api/post-media/media-1']);
  });

  it('서버 검증 실패도 예약을 정리하고 원래 오류를 전달해야 한다', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url === '/api/post-media/uploads') return Response.json(plan);
        if (url === plan.url) return new Response(null, { status: 204 });
        if (url === '/api/post-media/media-1/complete')
          return Response.json(
            { errorCode: 'INVALID_ATTACHMENT', message: '파일 형식을 확인해주세요.' },
            { status: 400 },
          );
        if (url === '/api/post-media/media-1') return new Response(null, { status: 503 });
        throw new Error('Unexpected request');
      }),
    );
    await expect(uploadMedia(file)).rejects.toMatchObject({ errorCode: 'INVALID_ATTACHMENT' });
    expect(urls).toEqual([
      '/api/post-media/uploads',
      plan.url,
      '/api/post-media/media-1/complete',
      '/api/post-media/media-1',
    ]);
  });
});
