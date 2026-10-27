import { renderToString } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import { FeedFilters } from './FeedFilters';

function unansweredButton(initialSearch: string) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <FeedFilters locale="ko" initialSearch={initialSearch} onCompose={() => undefined} />,
  );
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === '답변 대기');
  if (!button) throw new Error('답변 대기 버튼이 있어야 한다');
  return button;
}

describe('feed tab in the first HTML', () => {
  // 피드 탭은 빈 검색으로 서버 렌더해 ?tab=unanswered 문서도 '답변 대기'를 꺼진 상태로 보냈다.
  it('presses the unanswered tab from the server snapshot', () => {
    expect(unansweredButton('?q=&tab=unanswered').getAttribute('aria-pressed')).toBe('true');
    expect(unansweredButton('?q=&tab=latest').getAttribute('aria-pressed')).toBe('false');
  });
});
