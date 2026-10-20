import { afterEach, expect, it, vi } from 'vitest';
import { uploadAttachment } from './chat.api';

const file = new File(['image-content'], 'chat.png', { type: 'image/png' });
const media = {
  id: 'file-1',
  name: file.name,
  mimeType: file.type,
  size: file.size,
  kind: 'IMAGE',
  url: '/api/conversations/room-1/attachments/file-1',
};
const path = '/api/conversations/room-1/attachments';
const plan = {
  mode: 'DIRECT',
  id: media.id,
  url: 'https://uploads.example.test/bucket',
  fields: { key: 'staging/chat', Policy: 'signed-policy' },
  expiresAt: '2026-10-21T12:00:00.000Z',
};
afterEach(() => vi.unstubAllGlobals());

it('채팅 전송 예약과 완료는 같은 대화 경로를 사용하고 파일은 S3로 보내야 한다', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url === `${path}/uploads`) return Response.json(plan);
      if (url === plan.url) return new Response(null, { status: 204 });
      if (url === `${path}/${media.id}/complete`) return Response.json(media);
      throw new Error('Unexpected request');
    }),
  );
  expect(await uploadAttachment('room-1', file)).toEqual(media);
  expect(requests.map((request) => request.url)).toEqual([
    `${path}/uploads`,
    plan.url,
    `${path}/${media.id}/complete`,
  ]);
  expect(requests[1]?.init?.credentials).toBe('omit');
  expect(requests[1]?.init?.body).toBeInstanceOf(FormData);
});

it('직접 전송이 실패하면 같은 대화의 미전송 첨부 예약을 삭제해야 한다', async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method });
      if (url === `${path}/uploads`) return Response.json(plan);
      if (url === plan.url) return new Response(null, { status: 403 });
      if (url === `${path}/${media.id}`) return Response.json({ ok: true });
      throw new Error('Unexpected request');
    }),
  );
  await expect(uploadAttachment('room-1', file)).rejects.toMatchObject({ errorCode: 'UPLOAD_FAILED' });
  expect(requests.at(-1)).toEqual({ url: `${path}/${media.id}`, method: 'DELETE' });
  expect(requests.map((request) => request.url)).not.toContain(`${path}/${media.id}/complete`);
});

it('로컬 채팅 첨부는 기존 multipart 경로를 사용해야 한다', async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === `${path}/uploads`) return Response.json({ mode: 'PROXY' });
      if (url === path) return Response.json(media);
      throw new Error('Unexpected request');
    }),
  );
  expect(await uploadAttachment('room-1', file)).toEqual(media);
  expect(urls).toEqual([`${path}/uploads`, path]);
});
