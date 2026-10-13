import sharp from 'sharp';

interface ITestImageOptions {
  width?: number;
  height?: number;
  color?: string;
  format?: 'png' | 'jpeg' | 'webp';
}

/** 업로드 검증을 통과하는 실제 이미지 파일 */
export function createTestImage({
  width = 160,
  height = 160,
  color = '#316447',
  format = 'png',
}: ITestImageOptions = {}) {
  const image = sharp({ create: { width, height, channels: 3, background: color } });
  if (format === 'jpeg') return image.jpeg().toBuffer();
  if (format === 'webp') return image.webp().toBuffer();
  return image.png().toBuffer();
}
