import { describe, expect, it } from 'vitest';

import {
  adminReportsPath,
  adminSupportListPath,
  adminSupportPath,
  adminUserPath,
  parseAdminRoute,
} from './admin-route';

describe('local admin routes', () => {
  it('restores a selected support thread or user from the URL', () => {
    expect(parseAdminRoute(adminSupportPath('thread-1'))).toEqual({
      tab: 'support',
      threadId: 'thread-1',
      userId: '',
      reportStatus: 'OPEN',
      supportStatus: 'ALL',
    });
    expect(parseAdminRoute(adminUserPath('user-1'))).toEqual({
      tab: 'users',
      userId: 'user-1',
      threadId: '',
      reportStatus: 'OPEN',
      supportStatus: 'ALL',
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
  it('restores the support status filter with the selected thread and defaults to every inquiry', () => {
    expect(parseAdminRoute(adminSupportListPath('CLOSED'))).toMatchObject({
      tab: 'support',
      threadId: '',
      supportStatus: 'CLOSED',
    });
    expect(parseAdminRoute(adminSupportPath('thread-1', 'OPEN'))).toMatchObject({
      threadId: 'thread-1',
      supportStatus: 'OPEN',
    });
    expect(adminSupportListPath('ALL')).toBe('#support');
    expect(adminSupportPath('thread-1')).toBe('#support?thread=thread-1');
    expect(parseAdminRoute('#support?status=REVIEWED')).toMatchObject({ supportStatus: 'ALL' });
  });
  it('does not turn malformed hashes into API identifiers', () => {
    expect(parseAdminRoute('#invalid?user=%2Fapi%2Fusers')).toEqual({
      tab: 'support',
      userId: '',
      threadId: '',
      reportStatus: 'OPEN',
      supportStatus: 'ALL',
    });
    expect(parseAdminRoute('#users?user=')).toEqual({
      tab: 'users',
      userId: '',
      threadId: '',
      reportStatus: 'OPEN',
      supportStatus: 'ALL',
    });
  });
});
