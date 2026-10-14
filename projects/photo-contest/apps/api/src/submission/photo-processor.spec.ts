import { crc32 } from 'node:zlib';

import { GraphQLError } from 'graphql';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from '../config/limits';
import { PHOTO_ERROR, processPhoto } from './photo-processor';

const PNG_SIGNATURE_BYTES = 8;
// IHDR 청크: 길이(4) + 종류(4) + 너비(4) + 높이(4) ...
const IHDR_WIDTH_OFFSET = PNG_SIGNATURE_BYTES + 8;
const IHDR_DATA_LENGTH = 13;

function solidImage(width: number, height: number, background = '#316447') {
  return sharp({ create: { width, height, channels: 3, background } });
}

async function rejection(body: unknown) {
  try {
    await processPhoto(body);
  } catch (error) {
    if (error instanceof GraphQLError) return { message: error.message, code: error.extensions.code };
    throw error;
  }
  throw new Error('예외가 나지 않았습니다.');
}

/** 헤더의 크기만 바꾼 PNG. 픽셀을 실제로 만들지 않고 픽셀 수 상한을 확인한다. */
async function pngClaimingSize(width: number, height: number) {
  const png = Buffer.from(await solidImage(1, 1).png().toBuffer());
  png.writeUInt32BE(width, IHDR_WIDTH_OFFSET);
  png.writeUInt32BE(height, IHDR_WIDTH_OFFSET + 4);
  const chunkType = IHDR_WIDTH_OFFSET - 4;
  png.writeUInt32BE(
    crc32(png.subarray(chunkType, IHDR_WIDTH_OFFSET + IHDR_DATA_LENGTH)),
    IHDR_WIDTH_OFFSET + 13,
  );
  return png;
}

describe('사진 변환', () => {
  it('JPEG·PNG·WebP를 WebP로 다시 인코딩해야 한다', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const output = await processPhoto(await solidImage(160, 120).toFormat(format).toBuffer());
      const metadata = await sharp(output).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 160, 120]);
    }
  });

  it('긴 변을 1600px로 줄이되 작은 사진은 키우지 않아야 한다', async () => {
    const large = await sharp(await processPhoto(await solidImage(3200, 1600).jpeg().toBuffer())).metadata();
    expect([large.width, large.height]).toEqual([1600, 800]);
    const small = await sharp(await processPhoto(await solidImage(90, 40).png().toBuffer())).metadata();
    expect([small.width, small.height]).toEqual([90, 40]);
  });

  it('EXIF 방향대로 돌린 뒤 EXIF 등 메타데이터를 남기지 않아야 한다', async () => {
    const source = await solidImage(200, 100)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Private Owner' } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(source).metadata()).orientation).toBe(6);
    const output = await processPhoto(source);
    const metadata = await sharp(output).metadata();
    expect([metadata.width, metadata.height]).toEqual([100, 200]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(output.includes('Private Owner')).toBe(false);
  });

  it('본문이 비었거나 버퍼가 아니거나 10MB를 넘으면 거부해야 한다', async () => {
    const expected = { message: PHOTO_ERROR.INVALID_BODY, code: 'BAD_USER_INPUT' };
    expect(await rejection(Buffer.alloc(0))).toEqual(expected);
    expect(await rejection(undefined)).toEqual(expected);
    expect(await rejection('image')).toEqual(expected);
    expect(await rejection(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toEqual(expected);
  });

  it('이미지가 아니거나 디코딩 중 깨지는 파일은 읽을 수 없다고 거부해야 한다', async () => {
    const expected = { message: PHOTO_ERROR.UNREADABLE, code: 'BAD_USER_INPUT' };
    expect(await rejection(Buffer.from('<svg onload="alert(1)"></svg>'))).toEqual(expected);
    const jpeg = await solidImage(400, 400).jpeg().toBuffer();
    expect(await rejection(jpeg.subarray(0, Math.floor(jpeg.length / 2)))).toEqual(expected);
  });

  it('GIF·움직이는 사진·40MP 초과 사진은 지원하지 않는다고 거부해야 한다', async () => {
    const expected = { message: PHOTO_ERROR.UNSUPPORTED, code: 'BAD_USER_INPUT' };
    expect(await rejection(await solidImage(40, 40).gif().toBuffer())).toEqual(expected);
    // 같은 프레임은 WebP 인코더가 하나로 합치므로 색을 다르게 한다.
    const frames = await Promise.all(
      ['#316447', '#c2410c'].map((color) => solidImage(40, 40, color).png().toBuffer()),
    );
    const animated = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await rejection(animated)).toEqual(expected);
    expect(await rejection(await pngClaimingSize(8000, 5001))).toEqual(expected);
  });
});
