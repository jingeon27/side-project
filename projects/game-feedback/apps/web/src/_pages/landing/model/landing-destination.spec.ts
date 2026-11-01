import { describe, expect, it } from 'vitest';

import { landingDestination } from './landing-destination';

describe('랜딩 시작 목적지', () => {
  it.each([
    null,
    '',
    '//outside.example',
    'https://outside.example/ko',
    '/ko/login',
    '/ko/onboarding',
    '/about',
    '/ko/boards/unknown',
    '/ko/../api/session',
  ])('%s는 기본 홈으로 돌아가야 한다', (redirect) => {
    expect(landingDestination(redirect)).toEqual({ href: '/ko', screen: 'feed', redirected: false });
  });
  it.each([
    ['/ko/boards/friendly?battleMode=DUEL', 'boards'],
    ['/en/posts/sample-post-0?board=free', 'post'],
    ['/ja', 'feed'],
    ['/ko/write?board=coaching&coachingRole=STUDENT', 'compose'],
  ])('검증한 서비스 경로 %s의 게시판과 언어 문맥을 유지해야 한다', (href, screen) => {
    expect(landingDestination(href)).toEqual({ href, screen, redirected: true });
  });
});
