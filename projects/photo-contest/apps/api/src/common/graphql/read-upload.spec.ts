import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { readUpload } from './read-upload';

function file(stream: Readable) {
  return Promise.resolve({
    filename: 'test.png',
    mimetype: 'image/png',
    encoding: '7bit',
    createReadStream: () => stream,
  });
}

describe('multipart 파일 읽기', () => {
  it('크기 상한까지 스트림을 읽고 MIME과 파일 내용을 넘겨야 한다', async () => {
    const result = await readUpload(file(Readable.from([Buffer.from('ab'), Buffer.from('cd')])), 4);
    expect(result).toEqual({ body: Buffer.from('abcd'), contentType: 'image/png' });
  });
  it('크기를 초과하면 스트림을 중단하고 입력 오류로 거절해야 한다', async () => {
    const stream = Readable.from([Buffer.from('abcde')]);
    await expect(readUpload(file(stream), 4)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(stream.destroyed).toBe(true);
  });
  it('파일 전송 중단도 내부 오류를 노출하지 않아야 한다', async () => {
    await expect(readUpload(Promise.reject(new Error('private transport details')), 4)).rejects.toMatchObject(
      {
        message: '파일을 읽을 수 없습니다. 파일 형식과 크기를 확인해 주세요.',
        extensions: { code: 'BAD_USER_INPUT' },
      },
    );
  });
});
