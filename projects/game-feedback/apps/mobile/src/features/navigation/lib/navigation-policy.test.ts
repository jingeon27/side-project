import { expect, it } from 'vitest';

import { parseWebOrigin } from '@/shared/config/web-origin';

import { decideNavigation, isSameOrigin, toWebPath } from './navigation-policy';

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
