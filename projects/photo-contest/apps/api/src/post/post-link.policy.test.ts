import { describe, expect, it } from 'vitest';

import { POST_LINK_LIMIT } from '../config/limits';
import { postLink } from './post-link.policy';

const ORIGIN = 'https://example.com/';

describe('postLink', () => {
  it('정규화로 길어진 주소가 상한을 넘으면 거부해야 한다', () => {
    // 원문은 상한 안이지만 한글 경로가 퍼센트 인코딩되면 저장값이 2048자를 넘었다.
    const raw = `${ORIGIN}${'가'.repeat(700)}`;
    expect(raw.length).toBeLessThanOrEqual(POST_LINK_LIMIT);
    expect(() => postLink(raw)).toThrow('http:// 또는 https://');
  });

  it('저장하는 값은 항상 상한 안이어야 한다', () => {
    const exact = `${ORIGIN}${'a'.repeat(POST_LINK_LIMIT - ORIGIN.length)}`;
    expect(postLink(exact)).toHaveLength(POST_LINK_LIMIT);
    expect(() => postLink(`${exact}a`)).toThrow('http:// 또는 https://');
  });
});
