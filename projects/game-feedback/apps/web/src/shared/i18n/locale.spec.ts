import { describe, expect, it } from 'vitest';

import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

import { detectLocale, languagePreference, localePath, preferredLocale } from './locale';
import { translate } from './messages';

describe('language preference', () => {
  it('가입 안내의 언어를 바꾸면 인증 화면과 원래 목적지의 언어를 함께 바꿔야 한다', () => {
    const parent = appRoutes.search('ko', {
      board: 'coaching',
      game: 'another-game',
      q: '주말',
      coachingRole: 'STUDENT',
    });
    const translated = localePath(appRoutes.onboarding('ko', parent), 'ja');
    expect(translated).toBe(appRoutes.onboarding('ja', localePath(parent, 'ja')));
    expect(resolveAppRoute(translated)).toMatchObject({
      screen: 'onboarding',
      locale: 'ja',
      parent: localePath(parent, 'ja'),
    });
    expect(localePath(appRoutes.onboarding('ko', '/ko/privacy'), 'en')).toBe(
      appRoutes.onboarding('en', '/en/privacy'),
    );
    expect(localePath(appRoutes.onboarding('ko', appRoutes.login('ko')), 'en')).toBe(
      appRoutes.onboarding('en', '/en'),
    );
    expect(localePath(appRoutes.login('ko', appRoutes.onboarding('ko')), 'en')).toBe(
      appRoutes.login('en', '/en'),
    );
  });
  it.each([
    ['ko-KR,ko;q=0.9,en;q=0.5', 'ko'],
    ['ja-JP,en;q=0.8', 'ja'],
    ['en-GB,en;q=0.9', 'en'],
    ['en;q=0.2,ja-JP;q=0.9', 'ja'],
    ['ko;q=0,ja;q=0.5', 'ja'],
    ['ko;q=invalid,en;q=1.5,ja;q=0.8', 'ja'],
    ['fr-FR,*;q=0.1', 'en'],
  ])('matches device/browser locale %s', (header, expected) => {
    expect(detectLocale(header)).toBe(expected);
  });
  it('keeps manual preferences ahead of region and lets auto resume device detection', () => {
    expect(preferredLocale('en', 'ko-KR')).toBe('en');
    expect(preferredLocale('ja', 'en-US')).toBe('ja');
    expect(preferredLocale('auto', 'ko-KR')).toBe('ko');
    expect(preferredLocale('invalid', 'ja-JP')).toBe('ja');
    expect(languagePreference('fr')).toBe('auto');
    expect(detectLocale(null)).toBe('en');
  });
  it('retains details, search filters and opaque cursor values during language changes', () => {
    expect(localePath('/ko/messages/room-1', 'ja')).toBe('/ja/messages/room-1');
    expect(localePath('/en?tab=unanswered&q=hog', 'ko')).toBe('/ko?tab=unanswered&q=hog');
    expect(localePath('/ko#feed', 'ja')).toBe('/ja#feed');
    expect(localePath('/ko/users/player-1?cursor=a%2B%2F%3D', 'en')).toBe(
      '/en/users/player-1?cursor=a%2B%2F%3D',
    );
    expect(localePath('//example.com', 'en')).toBe('/en');
  });
  it('translates service copy and placeholders while preserving user-authored content', () => {
    expect(translate('en', '피드')).toBe('Feed');
    expect(translate('ja', '언어 설정')).toBe('言語設定');
    expect(translate('en', '채팅 {count}개', { count: 3 })).toBe('Chats: 3');
    expect(translate('ko', '채팅 {count}개', { count: 3 })).toBe('채팅 3개');
    expect(translate('en', 'My own post title')).toBe('My own post title');
    expect(translate('en', '회원가입')).toBe('Sign up');
    expect(translate('ja', '가입 완료하기')).toBe('登録を完了');
    expect(translate('en', '사용할 닉네임을 정하고 필수 항목에 동의해 주세요.')).toBe(
      'Choose a nickname and agree to the required items.',
    );
    expect(translate('ja', '사용할 닉네임을 정하고 필수 항목에 동의해 주세요.')).toBe(
      'ニックネームを決めて、必須項目に同意してください。',
    );
  });
  it('로그인 페이지의 언어를 바꿔도 복귀할 게시판과 검색 조건을 유지해야 한다', () => {
    expect(localePath('/ko/login?returnTo=%2Fko%2Fboards%2Fcoaching%3FcoachingRole%3DSTUDENT', 'en')).toBe(
      '/en/login?returnTo=%2Fen%2Fboards%2Fcoaching%3FcoachingRole%3DSTUDENT',
    );
  });
});
