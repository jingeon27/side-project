import { z } from 'zod';

import { ApiError } from './http/api-error';

export const MEDIA_FILE_LIMIT = 25 * 1024 * 1024;
const sizeSchema = z.number().int().positive().max(MEDIA_FILE_LIMIT);
/** 업로드 예약의 JSON 이름에서 경로 구분자·제어 문자를 바꾸고 100자로 자른다. */
function fileName(value: string) {
  return Array.from(value.replace(/[\\/\u0000-\u001f\u007f]/g, '_'))
    .slice(0, 100)
    .join('');
}
/** 매직 바이트 판별에 필요한 앞부분 길이. webm은 이 범위 안에서 DocType을 찾는다. */
export const MEDIA_SIGNATURE_BYTES = 4096;
function detectMediaType(bytes: Buffer) {
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
        bytes.subarray(0, MEDIA_SIGNATURE_BYTES).includes(Buffer.from('webm')),
    ],
  ] as const;
  return matches.find((entry) => entry[1])?.[0];
}
function invalidMedia() {
  return new ApiError(400, 'INVALID_ATTACHMENT', '지원하는 이미지나 동영상 파일을 선택해주세요.');
}
/**
 * 저장소에 이미 올라간 파일은 앞부분만 읽어 판별한다. 전체 크기는 호출자가 저장소 메타데이터로 확인한다.
 * `header`는 파일 앞 `min(size, MEDIA_SIGNATURE_BYTES)` 바이트여야 한다.
 */
export function validateMediaHeader(input: { name: string; mimeType: string; size: number; header: Buffer }) {
  const size = sizeSchema.safeParse(input.size);
  if (!size.success || input.header.length !== Math.min(input.size, MEDIA_SIGNATURE_BYTES))
    throw invalidMedia();
  if (detectMediaType(input.header) !== input.mimeType) throw invalidMedia();
  return { mimeType: input.mimeType, size: input.size, name: fileName(input.name) };
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
