import { describe, expect, it } from 'vitest';

import { postSchema } from './post.schema';

describe('게시물 파일 검증', () => {
  it('MIME이 비어 있어도 HEIC 확장자로 선택한 사진은 허용해야 한다', () => {
    expect(postSchema.shape.media.safeParse(new File(['photo'], 'moment.HEIC')).success).toBe(true);
  });

  it('확장자만 이미지인 일반 파일과 없는 파일은 거부해야 한다', () => {
    expect(postSchema.shape.media.safeParse(new File(['text'], 'fake.png')).success).toBe(false);
    expect(postSchema.shape.media.safeParse(null).success).toBe(false);
  });
});
