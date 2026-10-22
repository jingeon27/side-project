import { describe, expect, it } from 'vitest';

import { bannedUserMayWrite } from './banned-access';

describe('writes kept for banned users', () => {
  it.each([
    ['POST', '/api/support/conversations'],
    ['POST', '/api/auth/logout'],
    ['DELETE', '/api/me'],
    ['POST', '/api/conversations/room-1/messages'],
    ['POST', '/api/conversations/room-1/read'],
    ['POST', '/api/conversations/room-1/attachments'],
    ['POST', '/api/conversations/room-1/attachments/uploads'],
    ['DELETE', '/api/conversations/room-1/attachments/file-1'],
    ['POST', '/api/conversations/room-1/attachments/file-1/complete'],
  ])('allows %s %s so the support chat keeps working', (method, path) => {
    expect(bannedUserMayWrite(method, path)).toBe(true);
  });
  it.each([
    ['POST', '/api/posts'],
    ['PATCH', '/api/me'],
    ['POST', '/api/conversations'],
    ['POST', '/api/conversations/room-1/attachments/file-1/complete/extra'],
    ['POST', '/api/conversations/room-1/messages/message-1/extra'],
    ['POST', '/api/conversations/room-1/history'],
    ['POST', '/API/support/conversations'],
  ])('rejects %s %s', (method, path) => {
    expect(bannedUserMayWrite(method, path)).toBe(false);
  });
});
