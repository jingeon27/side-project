import { describe, it, expect } from 'vitest';
import { mediaRange, validateChatFile } from './chat-file';
describe('chat media boundaries', () => {
  it('preserves UTF-8 filenames from multipart headers without splitting emoji', () => {
    const name = '친선전 연습🎮.png';
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const file = validateChatFile({
      originalname: Buffer.from(name, 'utf8').toString('latin1'),
      mimetype: 'image/png',
      size: buffer.length,
      buffer,
    });
    expect(file.name).toBe(name);
    expect(() => encodeURIComponent(file.name)).not.toThrow();
  });
  it('supports full, open-ended and suffix ranges and rejects invalid ranges', () => {
    expect(mediaRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false });
    expect(mediaRange('bytes=10-', 100)).toEqual({ start: 10, end: 99, partial: true });
    expect(mediaRange('bytes=-10', 100)).toEqual({ start: 90, end: 99, partial: true });
    for (const value of ['bytes=100-', 'bytes=20-10', 'bytes=0-1,2-3', 'bytes=-0', 'bytes=-'])
      expect(mediaRange(value, 100)).toBeNull();
  });
  it('rejects a type declaration that conflicts with the actual file signature', () => {
    expect(() =>
      validateChatFile({
        originalname: 'image.png',
        mimetype: 'image/png',
        size: 8,
        buffer: Buffer.from('notapng!'),
      }),
    ).toThrow();
  });
});
