import { describe, expect, it } from 'vitest';
import { detectLocale, preferredLocale, languagePreference, localePath } from './locale';
import { translate } from './messages';

describe('language preference', () => {
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
    expect(localePath('/ko/users/player-1?cursor=a%2B%2F%3D', 'en')).toBe(
      '/en/users/player-1?cursor=a%2B%2F%3D',
    );
    expect(localePath('//example.com', 'en')).toBe('/en');
  });
  it('translates service copy and placeholders while preserving user-authored content', () => {
    expect(translate('en', '피드백 라운지')).toBe('Feedback lounge');
    expect(translate('ja', '언어 설정')).toBe('言語設定');
    expect(translate('en', '채팅 {count}개', { count: 3 })).toBe('Chats: 3');
    expect(translate('ko', '채팅 {count}개', { count: 3 })).toBe('채팅 3개');
    expect(translate('en', 'My own post title')).toBe('My own post title');
  });
});
