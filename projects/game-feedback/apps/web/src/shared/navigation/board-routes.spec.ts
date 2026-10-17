import { describe, it, expect } from 'vitest';
import { appRoutes, resolveAppRoute, WebPathSchema } from '@game-feedback/bridge';
describe('community board navigation', () => {
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
      '/ko/posts/post-1?board=unknown',
      '/ko/boards/friendly?q=a&q=b',
      '/ko/boards/friendly?q=%E0%A4%A',
    ])
      expect(WebPathSchema.safeParse(path).success).toBe(false);
  });
});
