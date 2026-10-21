import { z } from 'zod';

import { ApiError } from './http/api-error';
import { parse } from './validation';

export const MEDIA_FILE_LIMIT = 25 * 1024 * 1024;
const uploadSchema = z.object({
  originalname: z.string().min(1).max(1000),
  mimetype: z.string(),
  size: z.number().int().positive().max(MEDIA_FILE_LIMIT),
  buffer: z.instanceof(Buffer),
});
function fileName(value: string) {
  const decoded = () => {
    if (/[^\u0000-\u00ff]/.test(value)) return value;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(value, 'latin1'));
    } catch {
      return value;
    }
  };
  return Array.from(decoded().replace(/[\\/\u0000-\u001f\u007f]/g, '_'))
    .slice(0, 100)
    .join('');
}
export function validateMediaFile(input: unknown) {
  const file = parse(uploadSchema, input);
  const bytes = file.buffer;
  const ascii = (start: number, end: number) => bytes.toString('ascii', start, end);
  const matches = [
    ['image/png', bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))],
    ['image/jpeg', bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255],
    ['image/gif', ['GIF87a', 'GIF89a'].includes(ascii(0, 6))],
    ['image/webp', ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'],
    ['video/mp4', bytes.length >= 12 && ascii(4, 8) === 'ftyp'],
    [
      'video/webm',
      bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) &&
        bytes.subarray(0, 4096).includes(Buffer.from('webm')),
    ],
  ] as const;
  const detected = matches.find((entry) => entry[1])?.[0];
  if (!detected || detected !== file.mimetype || bytes.length !== file.size)
    throw new ApiError(400, 'INVALID_ATTACHMENT', '지원하는 이미지나 동영상 파일을 선택해주세요.');
  return {
    bytes,
    mimeType: detected,
    size: file.size,
    name: fileName(file.originalname),
  };
}
export function mediaRange(header: string | undefined, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start)
    return null;
  return { start, end, partial: true };
}
