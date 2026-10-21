import sharp from 'sharp';
import type { Metadata } from 'sharp';

import { fail } from '../common/errors';
import { MAX_IMAGE_EDGE_PX, MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES, WEBP_QUALITY } from '../config/limits';

export const PHOTO_ERROR = {
  INVALID_BODY: '10MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.',
  UNSUPPORTED: '지원하지 않는 사진 형식 또는 크기입니다.',
  UNREADABLE: '사진을 읽을 수 없습니다. JPEG, PNG, WebP 파일을 확인해 주세요.',
} as const;

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Content-Type은 클라이언트가 정하므로 믿지 않고 파일 헤더의 실제 형식·픽셀 수로 판단한다(디코딩도 성공해야 받는다).
function isSupported({ format, width, height, pages }: Metadata) {
  return (
    SUPPORTED_FORMATS.has(format) &&
    width > 0 &&
    height > 0 &&
    width * height <= MAX_INPUT_PIXELS &&
    (pages ?? 1) === 1
  );
}

// 헤더만 읽으므로 픽셀 상한 없이 열어도 안전하다. 상한을 걸면 큰 사진이 '읽을 수 없음'으로 뭉뚱그려진다.
async function readMetadata(body: Buffer) {
  try {
    return await sharp(body, { limitInputPixels: false, failOn: 'warning' }).metadata();
  } catch {
    return fail(PHOTO_ERROR.UNREADABLE);
  }
}

/**
 * 업로드 원본을 검사하고 긴 변 1600px 이하 WebP로 다시 인코딩한다.
 * 방향은 EXIF대로 돌린 뒤 EXIF·GPS 같은 메타데이터를 모두 버린다(sharp는 기본적으로 메타데이터를 옮기지 않는다).
 */
export async function processPhoto(body: unknown, maxEdge = MAX_IMAGE_EDGE_PX): Promise<Buffer> {
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_UPLOAD_BYTES)
    fail(PHOTO_ERROR.INVALID_BODY);
  if (!isSupported(await readMetadata(body))) fail(PHOTO_ERROR.UNSUPPORTED);
  try {
    return await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'warning' })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return fail(PHOTO_ERROR.UNREADABLE);
  }
}
