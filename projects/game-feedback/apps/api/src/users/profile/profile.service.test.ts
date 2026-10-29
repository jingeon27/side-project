import { describe, expect, it } from 'vitest';

import { validateMediaHeader } from '../../common/media-file';

describe('프로필 사진 서명 검사', () => {
  it('PNG로 선언한 SVG·HEIF·AVIF·TIFF 바이트를 거부한다', () => {
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
      expect(
        () => validateMediaHeader({ name, mimeType: 'image/png', size: bytes.length, header: bytes }),
        name,
      ).toThrow();
  });
});
