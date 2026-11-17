import type { TBrief } from '../../story/model/story';

const targets = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1440, height: 1440 },
} as const satisfies Record<TBrief['ratio'], { width: number; height: number }>;

// The centered part of the source that fills the project ratio without stretching.
export function cropBox(width: number, height: number, ratio: TBrief['ratio']) {
  const target = targets[ratio];
  const size =
    width * target.height > height * target.width
      ? { width: Math.round((height * target.width) / target.height), height }
      : { width, height: Math.round((width * target.height) / target.width) };
  return { x: (width - size.width) / 2, y: (height - size.height) / 2, ...size, target };
}

// An image made elsewhere becomes a PNG in the project ratio, the form every scene image is stored in.
export async function fitImage(file: Blob, ratio: TBrief['ratio']) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('이미지를 읽지 못했습니다. PNG, JPG 또는 WebP 파일을 선택해 주세요.');
  });
  try {
    const box = cropBox(bitmap.width, bitmap.height, ratio);
    const canvas = document.createElement('canvas');
    canvas.width = box.target.width;
    canvas.height = box.target.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이미지를 변환하지 못했습니다.');
    context.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지를 변환하지 못했습니다.'))),
        'image/png',
      ),
    );
  } finally {
    bitmap.close();
  }
}
