import { describe, expect, it } from 'vitest';

import { startsNewDocument } from './document-load';

const PREVIOUS = 'https://contest.example/groups/1';

describe('startsNewDocument', () => {
  it('iOS에서 다른 주소로 가거나 새로고침하면 새 문서여야 한다', () => {
    expect(
      startsNewDocument({ platform: 'ios', url: 'https://contest.example/me', previousUrl: PREVIOUS }),
    ).toBe(true);
    expect(
      startsNewDocument({ platform: 'ios', url: PREVIOUS, navigationType: 'reload', previousUrl: PREVIOUS }),
    ).toBe(true);
  });

  it('iOS에서 해시만 바뀌면 같은 문서여야 한다', () => {
    expect(
      startsNewDocument({
        platform: 'ios',
        url: `${PREVIOUS}#photos`,
        navigationType: 'click',
        previousUrl: PREVIOUS,
      }),
    ).toBe(false);
  });

  it('Android는 화면 기록 변경에도 onLoadStart를 보내므로 새 문서로 보지 않아야 한다', () => {
    expect(
      startsNewDocument({ platform: 'android', url: 'https://contest.example/me', previousUrl: PREVIOUS }),
    ).toBe(false);
  });
});
