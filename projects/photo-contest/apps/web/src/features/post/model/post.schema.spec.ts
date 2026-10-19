import { describe, expect, it } from 'vitest';
import { postSchema } from './post.schema';

const post = {
  title: '웃긴 순간',
  body: '',
  media: new File(['photo'], 'moment.png', { type: 'image/png' }),
  rightsConfirmed: true,
};

describe('게시물의 대회 참여 선택', () => {
  it('사진 없이 링크로 등록하거나 파일과 링크를 함께 첨부할 수 있어야 한다', () => {
    expect(
      postSchema.parse({ ...post, media: null, linkUrl: ' https://youtu.be/abcdefghijk ' }),
    ).toMatchObject({ media: null, linkUrl: 'https://youtu.be/abcdefghijk' });
    expect(postSchema.safeParse({ ...post, linkUrl: 'https://example.com/source' }).success).toBe(true);
    expect(postSchema.safeParse({ ...post, media: null, linkUrl: '' }).success).toBe(false);
    expect(postSchema.safeParse({ ...post, linkUrl: 'javascript:alert(1)' }).success).toBe(false);
  });
  it('일반 게시물은 대회를 선택하지 않아도 등록할 수 있어야 한다', () => {
    expect(postSchema.parse(post)).toMatchObject({ participateInContest: false, contestId: '' });
    expect(
      postSchema.safeParse({ ...post, participateInContest: false, contestId: 'previous-selection' }).success,
    ).toBe(true);
  });
  it('대회 참여를 선택하면 대회 ID가 필수여야 한다', () => {
    for (const contestId of ['', '  ']) {
      const result = postSchema.safeParse({ ...post, participateInContest: true, contestId });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: ['contestId'] })]),
        );
    }
    expect(postSchema.safeParse({ ...post, participateInContest: true, contestId: 'contest' }).success).toBe(
      true,
    );
  });
  it('동영상도 대회에 참여할 수 있고 미디어·공유 권리 검증을 유지해야 한다', () => {
    const entry = {
      ...post,
      participateInContest: true,
      contestId: 'contest',
      media: new File(['video'], 'moment.mp4', { type: 'video/mp4' }),
    };
    expect(postSchema.safeParse(entry).success).toBe(true);
    expect(postSchema.safeParse({ ...entry, rightsConfirmed: false }).success).toBe(false);
    expect(postSchema.safeParse({ ...entry, media: null }).success).toBe(false);
  });
});
