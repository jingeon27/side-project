import { describe, expect, it, vi } from 'vitest';

import {
  IMAGE_MESSAGE,
  ImagePrepareError,
  UPLOAD_MAX_BYTES,
  fitWithin,
  isHeicFile,
  isImageFile,
  prepareUploadImage,
} from './image.helper';
import type { IImageCodec } from './image.helper';

const file = (name: string, type: string, size = 1024) => new File([new Uint8Array(size)], name, { type });

function codec({
  width = 4000,
  height = 3000,
  decodes = true,
  encoded = new Blob(['jpeg']) as Blob | null,
} = {}) {
  const close = vi.fn();
  const encodeJpeg = vi.fn(async () => encoded);
  const value: IImageCodec = {
    decode: vi.fn(async () => {
      if (!decodes) throw new DOMException('decode failed', 'InvalidStateError');
      return { width, height, close };
    }),
    encodeJpeg,
  };
  return { value, close, encodeJpeg };
}

describe('fitWithin', () => {
  it.each([
    [4000, 3000, { width: 2048, height: 1536 }],
    [3000, 4000, { width: 1536, height: 2048 }],
    [1200, 800, { width: 1200, height: 800 }],
    [10000, 1, { width: 2048, height: 1 }],
  ])('%i×%i → 긴 변 2048 이하', (width, height, expected) => {
    expect(fitWithin(width, height, 2048)).toEqual(expected);
  });
});

describe('파일 종류', () => {
  it('HEIC는 type이 비어 있어도 확장자로 알아봐야 한다', () => {
    expect(isHeicFile(file('IMG_0001.HEIC', ''))).toBe(true);
    expect(isHeicFile(file('photo.heif', 'image/heif'))).toBe(true);
    expect(isHeicFile(file('photo.jpg', 'image/jpeg'))).toBe(false);
    expect(isImageFile(file('IMG_0001.heic', ''))).toBe(true);
    expect(isImageFile(file('memo.txt', 'text/plain'))).toBe(false);
  });
});

describe('prepareUploadImage', () => {
  it('디코드할 수 있으면 긴 변 2048px JPEG로 다시 그려야 한다', async () => {
    const { value, close, encodeJpeg } = codec();

    const prepared = await prepareUploadImage(file('big.png', 'image/png'), value);

    expect(prepared.contentType).toBe('image/jpeg');
    expect(encodeJpeg).toHaveBeenCalledWith(expect.anything(), { width: 2048, height: 1536 }, 0.9);
    expect(close).toHaveBeenCalled();
  });

  it('브라우저가 디코드하지 못한 JPEG/PNG/WebP는 원본을 보내야 한다', async () => {
    const original = file('photo.webp', 'image/webp');

    const prepared = await prepareUploadImage(original, codec({ decodes: false }).value);

    expect(prepared).toEqual({ body: original, contentType: 'image/webp' });
  });

  it('디코드하지 못한 HEIC는 JPEG/PNG/WebP로 바꾸라고 알려야 한다', async () => {
    await expect(
      prepareUploadImage(file('IMG_1.HEIC', 'image/heic'), codec({ decodes: false }).value),
    ).rejects.toEqual(new ImagePrepareError(IMAGE_MESSAGE.HeicUnsupported));
  });

  it('줄이지 못한 원본이 10MB를 넘으면 알려야 한다', async () => {
    await expect(
      prepareUploadImage(
        file('huge.jpg', 'image/jpeg', UPLOAD_MAX_BYTES + 1),
        codec({ decodes: false }).value,
      ),
    ).rejects.toThrow(IMAGE_MESSAGE.TooLarge);
  });

  it('인코드에 실패하면 원본으로 대신해야 한다', async () => {
    const original = file('photo.jpg', 'image/jpeg');
    const { value, close } = codec({ encoded: null });

    expect(await prepareUploadImage(original, value)).toEqual({ body: original, contentType: 'image/jpeg' });
    expect(close).toHaveBeenCalled();
  });
});
