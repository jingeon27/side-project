import { expect, it } from 'vitest';

import { cropBox } from './image-import';

it('가져온 이미지는 늘이지 않고 작품 비율에 맞는 가운데 영역을 쓴다', () => {
  expect(cropBox(1536, 1024, '16:9')).toMatchObject({ x: 0, y: 80, width: 1536, height: 864 });
  expect(cropBox(1024, 1536, '9:16')).toMatchObject({ x: 80, y: 0, width: 864, height: 1536 });
  expect(cropBox(1536, 1024, '1:1')).toMatchObject({ x: 256, y: 0, width: 1024, height: 1024 });
  expect(cropBox(1920, 1080, '16:9')).toMatchObject({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    target: { width: 1920, height: 1080 },
  });
});
