import { describe, expect, it } from 'vitest';

import { uploadMediaSize } from './upload-media-size.helper';

describe('uploadMediaSize', () => {
  it('API가 받는 가로·세로는 그대로 보내야 한다', () => {
    expect(uploadMediaSize({ width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
    expect(uploadMediaSize({ width: 20_000, height: 1 })).toEqual({ width: 20_000, height: 1 });
  });

  it.each([
    { width: 24_000, height: 3000 },
    { width: 0, height: 1080 },
    { width: 1080.5, height: 1920 },
  ])('범위를 벗어난 크기는 올리기를 막지 않도록 비워야 한다: %j', (size) => {
    expect(uploadMediaSize(size)).toBeNull();
  });

  it('잴 수 없었던 크기는 그대로 비워야 한다', () => {
    expect(uploadMediaSize(null)).toBeNull();
  });
});
