import { describe, expect, it } from 'vitest';

import { isMediaPath } from './media-rate-limit.middleware';

describe('isMediaPath', () => {
  it.each([
    '/media/post-1',
    '/media/post-1/download',
    '/photos/photo-1',
    '/groups/group-1/avatar/avatar-1',
    '/profiles/user-1/avatar/avatar-1',
    '/media/post-1/',
  ])('고정 미디어 경로 %s를 세야 한다', (path) => {
    expect(isMediaPath(path)).toBe(true);
  });

  it.each([
    '/graphql',
    '/health',
    '/media',
    '/media/a/b/c',
    '/groups/group-1',
    '/auth/logout',
    '/testing/users',
  ])('다른 경로 %s는 세지 않아야 한다', (path) => {
    expect(isMediaPath(path)).toBe(false);
  });
});
