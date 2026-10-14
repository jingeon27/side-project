/** 업로드 전에 줄일 긴 변. 서버는 다시 1600px WebP로 바꾸므로 이보다 크게 보낼 필요가 없다. */
export const UPLOAD_MAX_SIDE = 2048;
export const UPLOAD_JPEG_QUALITY = 0.9;
/** 서버가 받는 원본 크기 상한. 브라우저가 줄이지 못한 원본에만 적용한다. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

const SERVER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_TYPE = /^image\/hei[cf](-sequence)?$/i;
const HEIC_EXTENSION = /\.hei[cf]$/i;

export const IMAGE_MESSAGE = {
  HeicUnsupported: '이 기기에서는 HEIC 사진을 바로 올릴 수 없어요. JPEG/PNG/WebP로 바꿔 주세요.',
  Unsupported: 'JPEG, PNG, WebP 사진만 올릴 수 있어요.',
  TooLarge: '10MB 이하의 사진을 선택해 주세요.',
} as const;

/** 사진을 올릴 수 있는 모양으로 바꾸지 못했을 때. message를 사진 칸 오류로 보여 준다. */
export class ImagePrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagePrepareError';
  }
}

interface IDecodedImage {
  width: number;
  height: number;
  close: () => void;
}

/** 브라우저 기능(디코드·인코드). 테스트에서 바꿔 끼운다. */
export interface IImageCodec<TImage extends IDecodedImage = IDecodedImage> {
  decode: (file: Blob) => Promise<TImage>;
  encodeJpeg: (image: TImage, size: { width: number; height: number }, quality: number) => Promise<Blob | null>;
}

export interface IPreparedImage {
  body: Blob;
  contentType: string;
}

export function isHeicFile(file: Pick<File, 'type' | 'name'>) {
  return HEIC_TYPE.test(file.type) || HEIC_EXTENSION.test(file.name);
}

/** 사진 선택 칸이 받는 파일(이미지 또는 확장자로 알 수 있는 HEIC) */
export function isImageFile(file: Pick<File, 'type' | 'name'>) {
  return file.type.startsWith('image/') || isHeicFile(file);
}

/** 비율을 지키며 긴 변을 maxSide 이하로 맞춘다. 이미 작으면 그대로 둔다. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function keepOriginal(file: File): IPreparedImage {
  if (isHeicFile(file)) throw new ImagePrepareError(IMAGE_MESSAGE.HeicUnsupported);
  if (!SERVER_IMAGE_TYPES.has(file.type)) throw new ImagePrepareError(IMAGE_MESSAGE.Unsupported);
  if (file.size > UPLOAD_MAX_BYTES) throw new ImagePrepareError(IMAGE_MESSAGE.TooLarge);
  return { body: file, contentType: file.type };
}

/**
 * 올리기 전에 긴 변 2048px 이하 JPEG로 다시 그린다(방향을 바로잡고 위치 정보 같은 메타데이터를 버린다).
 * 브라우저가 디코드하지 못하면 서버가 받는 형식(JPEG/PNG/WebP)의 원본만 그대로 보낸다. 최종 검증·변환은 서버가 한다.
 */
export async function prepareUploadImage<TImage extends IDecodedImage>(
  file: File,
  codec: IImageCodec<TImage>,
): Promise<IPreparedImage> {
  let image: TImage;
  try {
    image = await codec.decode(file);
  } catch {
    return keepOriginal(file);
  }
  try {
    const blob = await codec.encodeJpeg(image, fitWithin(image.width, image.height, UPLOAD_MAX_SIDE), UPLOAD_JPEG_QUALITY);
    return blob ? { body: blob, contentType: 'image/jpeg' } : keepOriginal(file);
  } finally {
    image.close();
  }
}

const drawToJpeg = (
  image: ImageBitmap,
  { width, height }: { width: number; height: number },
  quality: number,
): Promise<Blob | null> => {
  const draw = (context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null) => {
    if (!context) return false;
    // 투명한 PNG가 검게 보이지 않게 흰 바탕을 깐다.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return true;
  };
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    if (!draw(canvas.getContext('2d'))) return Promise.resolve(null);
    return canvas.convertToBlob({ type: 'image/jpeg', quality }).catch(() => null);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  if (!draw(canvas.getContext('2d'))) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
};

/** 브라우저의 createImageBitmap + canvas */
export const browserImageCodec: IImageCodec<ImageBitmap> = {
  decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  encodeJpeg: drawToJpeg,
};
