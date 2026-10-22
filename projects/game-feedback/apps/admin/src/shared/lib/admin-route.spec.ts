import { describe, expect, it } from 'vitest';

import { adminReportsPath, adminSupportPath, adminUserPath, parseAdminRoute } from './admin-route';

describe('local admin routes', () => {
  it('restores a selected support thread or user from the URL', () => {
    expect(parseAdminRoute(adminSupportPath('thread-1'))).toEqual({
      tab: 'support',
      threadId: 'thread-1',
      userId: '',
      reportStatus: 'OPEN',
    });
    expect(parseAdminRoute(adminUserPath('user-1'))).toEqual({
      tab: 'users',
      userId: 'user-1',
      threadId: '',
      reportStatus: 'OPEN',
    });
  });
  it('restores the report status filter and defaults to reports awaiting review', () => {
    expect(parseAdminRoute(adminReportsPath('DISMISSED'))).toMatchObject({
      tab: 'reports',
      reportStatus: 'DISMISSED',
    });
    expect(parseAdminRoute('#reports')).toMatchObject({ tab: 'reports', reportStatus: 'OPEN' });
    expect(parseAdminRoute('#reports?status=closed')).toMatchObject({ reportStatus: 'OPEN' });
  });
  it('does not turn malformed hashes into API identifiers', () => {
    expect(parseAdminRoute('#invalid?user=%2Fapi%2Fusers')).toEqual({
      tab: 'support',
      userId: '',
      threadId: '',
      reportStatus: 'OPEN',
    });
    expect(parseAdminRoute('#users?user=')).toEqual({
      tab: 'users',
      userId: '',
      threadId: '',
      reportStatus: 'OPEN',
    });
  });
});
