import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageUploadError, uploadToStorage, uploadWithTicket } from './upload-to-storage.helper';

const EXPIRES_AT = '2026-10-22T00:15:00.000Z';

afterEach(() => vi.unstubAllGlobals());

describe('저장소 직접 업로드', () => {
  it('정책 필드를 먼저 보내고 파일을 마지막에 넣으며 세션 쿠키를 전달하지 않아야 한다', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);
    const file = new Blob(['image'], { type: 'image/png' });
    await uploadToStorage(
      {
        url: 'https://storage.example',
        fields: [{ name: 'key', value: 'photos/00000000-0000-0000-0000-000000000000.jpg' }],
        expiresAt: EXPIRES_AT,
      },
      file,
    );
    const [url, options] = send.mock.calls[0] ?? [];
    expect(url).toBe('https://storage.example');
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(options?.headers).toBeUndefined();
    const body = options?.body;
    if (!(body instanceof FormData)) throw new Error('multipart 본문이 필요합니다.');
    expect([...body.keys()]).toEqual(['key', 'file']);
    expect(body.get('key')).toBe('photos/00000000-0000-0000-0000-000000000000.jpg');
    const uploaded = body.get('file');
    if (!(uploaded instanceof Blob)) throw new Error('파일이 필요합니다.');
    expect(await uploaded.text()).toBe('image');
  });

  it.each(['network', 'rejected'])(
    '저장소 전송이 %s 오류로 실패하면 폼에 표시할 오류를 반환해야 한다',
    async (failure) => {
      const send = vi.fn<typeof fetch>();
      if (failure === 'network') send.mockRejectedValue(new TypeError('Failed to fetch'));
      if (failure === 'rejected') send.mockResolvedValue(new Response(null, { status: 403 }));
      vi.stubGlobal('fetch', send);
      await expect(
        uploadToStorage(
          { url: 'https://storage.example/bucket', fields: [], expiresAt: EXPIRES_AT },
          new Blob(['image']),
        ),
      ).rejects.toThrow(StorageUploadError);
    },
  );
});

describe('업로드 티켓 단계', () => {
  const ticket = { id: 'upload-1', url: 'https://storage.example', fields: [], expiresAt: EXPIRES_AT };

  it('티켓을 받아 저장소에 올리고 완료한 업로드 id를 돌려줘야 한다', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);
    const complete = vi.fn(async (uploadId: string) => `${uploadId}-done`);
    await expect(
      uploadWithTicket(new Blob(['image']), { request: async () => ticket, complete }),
    ).resolves.toBe('upload-1-done');
    expect(send).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith('upload-1');
  });

  it('티켓을 받지 못하면 저장소로 보내지 않고 실패해야 한다', async () => {
    const send = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', send);
    const complete = vi.fn(async () => 'never');
    await expect(
      uploadWithTicket(new Blob(['image']), { request: async () => undefined, complete }),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('티켓을 받는 동안 시트가 닫혔으면 올리지 않고 멈춰야 한다', async () => {
    const send = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', send);
    const controller = new AbortController();
    const complete = vi.fn(async () => 'never');
    const upload = uploadWithTicket(new Blob(['image']), {
      signal: controller.signal,
      request: async () => {
        controller.abort();
        return ticket;
      },
      complete,
    });
    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('저장소 전송이 실패하면 완료하지 않고 폼에 표시할 오류를 던져야 한다', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 })));
    const complete = vi.fn(async () => 'never');
    await expect(
      uploadWithTicket(new Blob(['image']), { request: async () => ticket, complete }),
    ).rejects.toThrow(StorageUploadError);
    expect(complete).not.toHaveBeenCalled();
  });
});
