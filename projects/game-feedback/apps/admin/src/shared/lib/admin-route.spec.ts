import { describe, expect, it } from 'vitest';

import { adminSupportPath, adminUserPath, parseAdminRoute } from './admin-route';

describe('local admin routes', () => {
  it('restores a selected support thread or user from the URL', () => {
    expect(parseAdminRoute(adminSupportPath('thread-1'))).toEqual({
      tab: 'support',
      threadId: 'thread-1',
      userId: '',
    });
    expect(parseAdminRoute(adminUserPath('user-1'))).toEqual({
      tab: 'users',
      userId: 'user-1',
      threadId: '',
    });
  });
  it('does not turn malformed hashes into API identifiers', () => {
    expect(parseAdminRoute('#invalid?user=%2Fapi%2Fusers')).toEqual({
      tab: 'support',
      userId: '',
      threadId: '',
    });
    expect(parseAdminRoute('#users?user=')).toEqual({ tab: 'users', userId: '', threadId: '' });
  });
});
