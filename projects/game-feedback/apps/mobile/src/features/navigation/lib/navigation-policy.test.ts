import { expect, it } from 'vitest';

import { parseWebOrigin } from '@/shared/config/web-origin';

import { decideNavigation, decideSubframeNavigation, isSameOrigin, toWebPath } from './navigation-policy';

it('대문자 호스트·:443으로 설정한 origin에서도 같은 origin의 탐색을 허용해야 한다', () => {
  const origin = parseWebOrigin('https://Feedback.Example:443', false);
  const page = 'https://feedback.example/ko/guide';
  expect(isSameOrigin(page, origin)).toBe(true);
  expect(decideNavigation(page, origin)).toEqual({ action: 'allow' });
  expect(toWebPath(page, origin)).toBe('/ko/guide');
  expect(decideNavigation('https://feedback.example.evil/ko', origin)).toEqual({
    action: 'external',
    url: 'https://feedback.example.evil/ko',
  });
});

it('하위 frame 이동은 외부 열기·앱 화면 이동 없이 같은 origin과 about:blank만 허용해야 한다', () => {
  const origin = 'https://feedback.example';
  for (const url of ['https://feedback.example/ko/guide', 'about:blank'])
    expect(decideSubframeNavigation(url, origin)).toEqual({ action: 'allow' });
  for (const url of [
    'https://example.com/ad',
    'tel:01000000000',
    'gamefeedback://ko/settings',
    'javascript:alert(1)',
  ])
    expect(decideSubframeNavigation(url, origin)).toEqual({ action: 'block' });
});
