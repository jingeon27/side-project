import { describe, expect, it } from 'vitest';

import { MEDIA_FILE_LIMIT, MEDIA_SIGNATURE_BYTES, mediaRange, validateMediaHeader } from './media-file';

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(MEDIA_SIGNATURE_BYTES),
]);

describe('stored media signature checks', () => {
  it('accepts a large file from its leading bytes and keeps the sanitized name', () => {
    expect(
      validateMediaHeader({
        name: '리플레이/1.png',
        mimeType: 'image/png',
        size: 20 * 1024 * 1024,
        header: png.subarray(0, MEDIA_SIGNATURE_BYTES),
      }),
    ).toEqual({ mimeType: 'image/png', size: 20 * 1024 * 1024, name: '리플레이_1.png' });
  });
  it('reads a webm DocType inside the signature window', () => {
    const header = Buffer.alloc(MEDIA_SIGNATURE_BYTES);
    Buffer.from([26, 69, 223, 163]).copy(header);
    Buffer.from('webm').copy(header, 40);
    expect(
      validateMediaHeader({ name: 'clip.webm', mimeType: 'video/webm', size: 9000, header }).mimeType,
    ).toBe('video/webm');
  });
  it.each([
    { label: 'declared type differs', mimeType: 'image/jpeg', size: 9000, length: MEDIA_SIGNATURE_BYTES },
    { label: 'header is shorter than the window', mimeType: 'image/png', size: 9000, length: 100 },
    { label: 'small file header is not the whole file', mimeType: 'image/png', size: 12, length: 16 },
    {
      label: 'size exceeds the media limit',
      mimeType: 'image/png',
      size: MEDIA_FILE_LIMIT + 1,
      length: 4096,
    },
  ])('rejects when $label', ({ mimeType, size, length }) => {
    expect(() =>
      validateMediaHeader({ name: 'x.png', mimeType, size, header: png.subarray(0, length) }),
    ).toThrow();
  });
});

describe('media byte ranges', () => {
  it('supports full, open-ended and suffix ranges and rejects invalid ranges', () => {
    expect(mediaRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false });
    expect(mediaRange('bytes=10-', 100)).toEqual({ start: 10, end: 99, partial: true });
    expect(mediaRange('bytes=-10', 100)).toEqual({ start: 90, end: 99, partial: true });
    for (const value of ['bytes=100-', 'bytes=20-10', 'bytes=0-1,2-3', 'bytes=-0', 'bytes=-'])
      expect(mediaRange(value, 100)).toBeNull();
  });
});
