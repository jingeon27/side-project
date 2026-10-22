import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageUploadError, uploadToStorage } from './upload-to-storage.helper';

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
        uploadToStorage({ url: 'https://storage.example/bucket', fields: [] }, new Blob(['image'])),
      ).rejects.toThrow(StorageUploadError);
    },
  );
});
