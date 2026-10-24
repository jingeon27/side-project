import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleObjectStorage } from './object-storage.mjs';

describe('공유 배포 S3 대역의 직접 업로드 확정', () => {
  const server = createServer(handleObjectStorage);
  const headers = {
    Host: 'gf-smoke-private.s3.ap-northeast-2.amazonaws.com',
    Authorization: 'AWS4-HMAC-SHA256 Credential=gf-smoke-access/20261025/ap-northeast-2/s3/aws4_request',
  };
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('테스트 저장소 포트가 필요하다');
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('조건부 CopyObject가 본문과 형식을 보존하고 SDK가 읽는 XML을 반환해야 한다', async () => {
    const key = `staging/${randomUUID()}`,
      target = `objects/${randomUUID()}`;
    const body = 'direct upload contents';
    await supertest(server)
      .put(`/${key}`)
      .set(headers)
      .set('Content-Type', 'image/png')
      .send(body)
      .expect(200);
    const copyHeaders = {
      ...headers,
      'x-amz-copy-source': `gf-smoke-private/${key}`,
      'x-amz-copy-source-if-match': '"smoke-etag"',
      'Content-Type': 'image/png',
    };
    await supertest(server)
      .put(`/${target}`)
      .set({ ...copyHeaders, 'x-amz-copy-source-if-match': '"changed"' })
      .expect(412);
    const copy = await supertest(server).put(`/${target}`).set(copyHeaders);
    expect(copy.status).toBe(200);
    expect(copy.text).toContain('<CopyObjectResult>');
    const stored = await supertest(server).get(`/${target}`).set(headers);
    expect(stored.headers['content-type']).toBe('image/png');
    expect(stored.body.toString()).toBe(body);
    await supertest(server)
      .put(`/objects/${randomUUID()}`)
      .set({ ...copyHeaders, 'x-amz-copy-source': `pc-smoke-private/${key}` })
      .expect(404);
  });
});
