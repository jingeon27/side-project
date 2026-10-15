import { describe, expect, it } from 'vitest';

import { koreanMonth } from './post-order';
import { mediaRange } from './media-range';

describe('갤러리 기간과 파일 범위', () => {
  it('UTC 월말이어도 한국의 다음 달을 계산해야 한다', () => {
    expect(koreanMonth(new Date('2026-09-30T15:00:00Z'))).toEqual({
      gte: new Date('2026-09-30T15:00:00Z'),
      lt: new Date('2026-10-31T15:00:00Z'),
    });
    expect(koreanMonth(new Date('2026-12-31T15:00:00Z')).lt).toEqual(new Date('2027-01-31T15:00:00Z'));
  });
  it('동영상의 구간·끝부분 요청과 잘못된 범위를 구분해야 한다', () => {
    expect(mediaRange('bytes=10-20', 100)).toEqual({ start: 10, end: 20 });
    expect(mediaRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(mediaRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    for (const range of ['bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=-', 'garbage'])
      expect(mediaRange(range, 100)).toBeNull();
  });
});
