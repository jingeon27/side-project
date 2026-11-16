import { describe, expect, it } from 'vitest';

import { parseSearch } from '@/shared/lib/query-string';

import { feedSnapshotSearch } from './feed-snapshot-search';

describe('feedSnapshotSearch', () => {
  it('빈 검색어도 기존 값과 같은 키로 남겨야 한다', () => {
    expect(feedSnapshotSearch({ q: '', tab: 'latest' })).toBe('?q=&tab=latest');
  });

  it('공백을 포함한 검색어를 첫 HTML과 브라우저 주소에서 같게 읽어야 한다', () => {
    const search = feedSnapshotSearch({ q: '호그 라이더', tab: 'unanswered' });
    expect(parseSearch(search)).toEqual({ q: '호그 라이더', tab: 'unanswered' });
    expect(parseSearch(search)).toEqual(
      parseSearch('?q=%ED%98%B8%EA%B7%B8+%EB%9D%BC%EC%9D%B4%EB%8D%94&tab=unanswered'),
    );
  });
});
