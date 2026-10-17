import { describe, it, expect } from 'vitest';
import { appRoutes, resolveAppRoute, WebPathSchema } from '@game-feedback/bridge';
describe('community board navigation', () => {
  it('opens the composer with a board and game parent while rejecting unsupported classifications', () => {
    const compose = appRoutes.compose('ja', 'COACHING', 'another-game');
    expect(compose).toBe('/ja/write?board=coaching&game=another-game');
    expect(resolveAppRoute(compose)).toMatchObject({
      screen: 'compose',
      tab: 'boards',
      game: 'another-game',
      parent: '/ja/boards/coaching?game=another-game',
    });
    expect(resolveAppRoute('/ko/write')).toMatchObject({ screen: 'compose', tab: 'feed', parent: '/ko' });
    expect(WebPathSchema.safeParse('/ko/write?board=account-trade').success).toBe(false);
  });
  it('preserves board search and gives direct detail links a board parent', () => {
    const path = appRoutes.boards('en', 'friendly', 'practice match');
    expect(resolveAppRoute(path)).toMatchObject({ path, tab: 'boards', screen: 'boards', parent: '/en' });
    const post = appRoutes.post('ko', 'post-1', 'FRIENDLY');
    expect(post).toBe('/ko/posts/post-1?board=friendly');
    expect(resolveAppRoute(post)).toMatchObject({ tab: 'boards', parent: '/ko/boards/friendly' });
  });
  it('rejects unknown board slugs and duplicate or malformed queries', () => {
    for (const path of [
      '/ko/boards/unknown',
      '/ko/boards/account-trade',
      '/ko/boards/friends',
      '/ko/boards/marketplace',
      '/ko/posts/post-1?board=account-trade',
      '/ko/posts/post-1?board=unknown',
      '/ko/boards/friendly?q=a&q=b',
      '/ko/boards/friendly?q=%E0%A4%A',
    ])
      expect(WebPathSchema.safeParse(path).success).toBe(false);
  });
  it('opens friend-slot sales with the matching detail parent', () => {
    expect(appRoutes.boards('ko')).toBe('/ko/boards/feedback');
    expect(resolveAppRoute(appRoutes.post('ko', 'post-1', 'FRIEND_SALE'))).toMatchObject({
      tab: 'boards',
      parent: '/ko/boards/friend-sale',
    });
  });
  it('keeps the game and all five board routes through search, detail and native parsing', () => {
    for (const slug of ['feedback', 'friend-sale', 'friendly', 'coaching', 'free']) {
      const path = appRoutes.boards('en', slug, 'lesson', 'another-game');
      expect(resolveAppRoute(path)).toMatchObject({ path, game: 'another-game', screen: 'boards' });
    }
    expect(resolveAppRoute(appRoutes.boards('ko', 'free', undefined, 'test--game-'))).toMatchObject({
      game: 'test--game-',
    });
    const detail = appRoutes.post('ko', 'post-1', 'COACHING', 'another-game');
    expect(resolveAppRoute(detail)).toMatchObject({
      game: 'another-game',
      parent: '/ko/boards/coaching?game=another-game',
    });
    for (const game of ['../other', 'unknown/game', 'UPPERCASE']) {
      expect(WebPathSchema.safeParse(`/ko/boards/free?game=${encodeURIComponent(game)}`).success).toBe(false);
    }
  });
});
