import { once } from 'node:events';
import { createServer, type RequestListener, type Server } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { S3PhotoStore } from './s3-photo-store';

let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});
async function store(handler: RequestListener) {
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');
  server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return new S3PhotoStore({
    bucket: 'test-bucket',
    region: 'us-east-1',
    endpoint: `http://127.0.0.1:${address.port}`,
    forcePathStyle: true,
  });
}
describe('S3 직접 업로드', () => {
  it('기존 대회 티켓은 5분보다 오래 유효한 POST 정책을 만들지 않아야 한다', async () => {
    const storage = await store((_req, res) => res.end());
    const form = await storage.presignUpload('staging/photo', 'image/jpeg', 300, 5 * 60);
    const policy = JSON.parse(Buffer.from(form.fields.Policy ?? '', 'base64').toString());
    expect(Date.parse(policy.expiration) - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(Date.parse(policy.expiration) - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });
  it('발급 정책에 정확한 크기·타입·staging 키와 15분 만료를 서명해야 한다', async () => {
    const storage = await store((_req, res) => res.end());
    const form = await storage.presignUpload('staging/test', 'image/png', 123);
    const policy = JSON.parse(Buffer.from(form.fields.Policy ?? '', 'base64').toString());
    expect(policy.conditions).toContainEqual(['content-length-range', 123, 123]);
    expect(policy.conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
    expect(form.fields.key).toBe('staging/test');
    expect(Date.parse(policy.expiration) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(Date.parse(policy.expiration) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
  });
  it('HEAD·서버 복사·Range만 사용하고 범위를 무시한 큰 응답은 본문 전에 거절해야 한다', async () => {
    const seen: string[] = [];
    const storage = await store((req, res) => {
      seen.push(`${req.method} ${req.url}`);
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Length': 4, 'Content-Type': 'video/mp4' }).end();
        return;
      }
      if (req.method === 'PUT') {
        expect(req.headers['x-amz-copy-source']).toBe('test-bucket/staging/source');
        res.setHeader('Content-Type', 'application/xml');
        res.end('<CopyObjectResult><ETag>"test"</ETag></CopyObjectResult>');
        return;
      }
      expect(req.headers.range).toBe('bytes=0-3');
      res.writeHead(206, { 'Content-Length': 4, 'Content-Range': 'bytes 0-3/4' }).end('test');
    });
    expect(await storage.head('staging/source')).toEqual({ byteSize: 4, contentType: 'video/mp4' });
    await storage.copy('staging/source', 'final.mp4');
    expect(await storage.readRange('final.mp4', 0, 3)).toEqual(Buffer.from('test'));
    expect(seen).toEqual([
      'HEAD /test-bucket/staging/source',
      'PUT /test-bucket/final.mp4?x-id=CopyObject',
      'GET /test-bucket/final.mp4?x-id=GetObject',
    ]);
    server?.removeAllListeners('request');
    server?.on('request', (_req, res) => {
      res.writeHead(200, { 'Content-Length': 100_000_000 });
      res.flushHeaders();
    });
    await expect(storage.readRange('final.mp4', 0, 3)).rejects.toThrow('range length');
  });
});
