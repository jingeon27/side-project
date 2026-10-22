import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { ProfileService } from './profile.service';

const sharp = vi.hoisted(() => vi.fn());
vi.mock('sharp', () => ({ default: sharp }));

const req = { gfSession: { user: { id: 'user-1' } } } as unknown as SessionRequest;
const service = new ProfileService({} as never, {} as never, {} as never, {} as never, {} as never);
async function uploadError(buffer: Buffer, mimetype: string) {
  const error = await service.upload(req, { buffer, mimetype }).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return { status: (error as ApiError).getStatus(), body: (error as ApiError).getResponse() };
}

describe('프로필 사진 서명 검사', () => {
  beforeEach(() => {
    sharp.mockReset();
    sharp.mockImplementation(() => ({ metadata: () => Promise.reject(new Error('decoder stub')) }));
  });
  it('PNG로 선언한 SVG·HEIF·AVIF·TIFF 바이트를 sharp에 넘기기 전에 거부한다', async () => {
    const box = (brand: string) =>
      Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}\0\0\0\0mif1${brand}`)]);
    const disguised = {
      svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
      xmlSvg: Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
      heif: box('heic'),
      avif: box('avif'),
      tiffLittleEndian: Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
      tiffBigEndian: Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
    };
    for (const [name, bytes] of Object.entries(disguised))
      expect(await uploadError(bytes, 'image/png'), name).toEqual({
        status: 400,
        body: { errorCode: 'INVALID_AVATAR', message: '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.' },
      });
    expect(sharp).not.toHaveBeenCalled();
  });
  it('JPEG·PNG·WebP 서명만 디코더로 보낸다', async () => {
    const signed = {
      'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
      'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
    };
    for (const [mimetype, bytes] of Object.entries(signed))
      expect((await uploadError(bytes, mimetype)).body, mimetype).toMatchObject({
        message: '사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.',
      });
    expect(sharp).toHaveBeenCalledTimes(3);
  });
});
