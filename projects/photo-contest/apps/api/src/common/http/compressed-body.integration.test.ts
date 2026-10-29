import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../../../test/support/app';

describe('압축 GraphQL JSON 요청 거절', () => {
  const state: { api?: ITestApi } = {};
  beforeAll(async () => {
    state.api = await createTestApp();
  });
  afterAll(async () => state.api?.close());

  it.each([
    { encoding: 'gzip', compress: gzipSync },
    { encoding: 'deflate', compress: deflateSync },
    { encoding: 'br', compress: brotliCompressSync },
  ])(
    '$encoding 본문과 뒤에 추가 바이트가 붙은 본문을 압축 해제 전에 거절해야 한다',
    async ({ encoding, compress }) => {
      if (!state.api) throw new Error('HTTP fixture must be initialized.');
      const compressed = compress(Buffer.from('{"query":"{ me { id } }"}'));
      for (const body of [compressed, Buffer.concat([compressed, Buffer.from('trailing-bytes')])]) {
        const response = await state.api
          .http()
          .post('/graphql')
          .set('Origin', TEST_WEB_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', encoding)
          .send(body)
          .expect(415);
        expect(response.body).toEqual({ message: '요청 본문을 읽을 수 없습니다.' });
      }
      const healthy = await state.api
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .send({ query: '{ me { id } }' })
        .expect(200);
      expect(healthy.body.data).toEqual({ me: null });
    },
  );
});
