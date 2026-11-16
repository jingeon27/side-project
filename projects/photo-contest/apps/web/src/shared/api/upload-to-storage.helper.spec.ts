import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageUploadError, uploadToStorage, uploadWithTicket } from './upload-to-storage.helper';

const EXPIRES_AT = '2026-10-22T00:15:00.000Z';

/** 진행률을 받는 저장소 전송(XHR) 대역. 응답은 테스트가 정하고, 브라우저처럼 끝나면 loadend를 보낸다. */
function stubUploadRequest() {
  const requests: UploadRequest[] = [];
  class UploadRequest extends EventTarget {
    readonly upload = new EventTarget();
    status = 0;
    withCredentials = true;
    readonly open = vi.fn<(method: string, url: string) => void>();
    readonly send = vi.fn<(body: FormData) => void>(() => {
      requests.push(this);
    });
    readonly abort = vi.fn(() => this.finish('abort'));
    progress(loaded: number, total: number) {
      this.upload.dispatchEvent(
        Object.assign(new Event('progress'), { lengthComputable: true, loaded, total }),
      );
    }
    respond(status: number) {
      this.status = status;
      this.finish('load');
    }
    finish(type: 'load' | 'error' | 'abort') {
      this.dispatchEvent(new Event(type));
      this.dispatchEvent(new Event('loadend'));
    }
  }
  vi.stubGlobal('XMLHttpRequest', UploadRequest);
  return requests;
}

const sentRequest = (requests: ReturnType<typeof stubUploadRequest>) => {
  expect(requests).toHaveLength(1);
  const [request] = requests;
  if (!request) throw new Error('저장소 요청이 있어야 합니다.');
  return request;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

describe('진행률을 받는 저장소 업로드', () => {
  const ticket = {
    url: 'https://storage.example',
    fields: [{ name: 'key', value: 'media/upload-1.mp4' }],
    expiresAt: EXPIRES_AT,
  };

  it('보낸 비율을 알리고 정책 필드 뒤에 파일을 넣어 쿠키 없이 보내야 한다', async () => {
    const requests = stubUploadRequest();
    const send = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', send);
    const onProgress = vi.fn();
    const upload = uploadToStorage(ticket, new Blob(['video'], { type: 'video/mp4' }), { onProgress });
    const request = sentRequest(requests);
    request.progress(45, 100);
    request.progress(100, 100);
    request.respond(204);
    await expect(upload).resolves.toBeUndefined();
    expect(onProgress.mock.calls).toEqual([[0.45], [1]]);
    expect(request.open).toHaveBeenCalledWith('POST', 'https://storage.example');
    expect(request.withCredentials).toBe(false);
    const body = request.send.mock.calls[0]?.[0];
    if (!(body instanceof FormData)) throw new Error('multipart 본문이 필요합니다.');
    expect([...body.keys()]).toEqual(['key', 'file']);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['network', 'rejected'])(
    '%s 오류는 진행률 없이 올릴 때와 같은 폼 오류로 바꿔야 한다',
    async (failure) => {
      const requests = stubUploadRequest();
      const upload = uploadToStorage(ticket, new Blob(['video']), { onProgress: () => {} });
      const request = sentRequest(requests);
      if (failure === 'network') request.finish('error');
      if (failure === 'rejected') request.respond(403);
      const error: unknown = await upload.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(StorageUploadError);
      expect(error).toHaveProperty('message', expect.stringContaining('파일을 올리지 못했어요'));
    },
  );

  it('부르는 쪽 신호가 끊기면 요청을 멈추고 폼 오류가 아닌 취소로 끝나야 한다', async () => {
    const requests = stubUploadRequest();
    const controller = new AbortController();
    const upload = uploadToStorage(ticket, new Blob(['video']), {
      signal: controller.signal,
      onProgress: () => {},
    });
    const request = sentRequest(requests);
    controller.abort();
    const error: unknown = await upload.catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(StorageUploadError);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(request.abort).toHaveBeenCalledOnce();
  });

  it('이미 끊긴 신호로는 요청을 보내지 않아야 한다', async () => {
    const requests = stubUploadRequest();
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadToStorage(ticket, new Blob(['video']), { signal: controller.signal, onProgress: () => {} }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toEqual([]);
  });

  it('티켓이 만료될 때까지 응답이 없으면 요청을 멈추고 시간 초과를 폼 오류로 알려야 한다', async () => {
    vi.useFakeTimers({ now: dayjs(EXPIRES_AT).subtract(15, 'minute').valueOf() });
    const requests = stubUploadRequest();
    const upload = uploadToStorage(ticket, new Blob(['video']), { onProgress: () => {} });
    const settled = upload.catch((reason: unknown) => reason);
    const request = sentRequest(requests);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    const error = await settled;
    expect(error).toBeInstanceOf(StorageUploadError);
    expect(error).toHaveProperty('message', expect.stringContaining('시간이 너무 오래'));
    expect(request.abort).toHaveBeenCalledOnce();
  });
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
