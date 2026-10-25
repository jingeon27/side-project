import { ApiError } from '@/shared/api';

/** 업로드 전에 크기와 방향을 정리하고 촬영 메타데이터를 제거한다. */
export async function prepareAvatar(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new ApiError(400, 'INVALID_AVATAR', '5MB 이하의 JPEG, PNG, WebP 사진을 선택해주세요.');
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!image) throw new ApiError(400, 'INVALID_AVATAR', '사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.');
  try {
    if (image.width * image.height > 40_000_000)
      throw new ApiError(400, 'INVALID_AVATAR', '4000만 화소 이하의 사진을 선택해주세요.');
    const edge = Math.min(512, image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext('2d');
    if (!context) throw new ApiError(400, 'INVALID_AVATAR', '사진을 준비하지 못했습니다.');
    const crop = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - crop) / 2,
      (image.height - crop) / 2,
      crop,
      crop,
      0,
      0,
      edge,
      edge,
    );
    const bytes = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Avatar conversion failed'))),
        'image/jpeg',
        0.85,
      ),
    );
    return new File([bytes], 'avatar.jpg', { type: bytes.type });
  } finally {
    image.close();
  }
}
