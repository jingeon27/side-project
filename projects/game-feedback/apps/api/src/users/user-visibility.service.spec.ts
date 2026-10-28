import { describe, expect, it, vi } from 'vitest';

import type { SessionRequest } from '../auth/session.types';
import type { AppConfig } from '../config/app.config';
import type { Prisma, PrismaClient } from '../generated/prisma';
import { UserVisibilityService } from './user-visibility.service';

function fakeDb(blocks: Array<{ userId: string; blockedUserId: string }>) {
  return {
    user: { findMany: vi.fn(async () => [{ id: 'test-account' }]) },
    block: { findMany: vi.fn(async () => blocks) },
  };
}
const normalMode = { demoMode: false, testAuthEnabled: false } as AppConfig;
function request(userId?: string) {
  return { gfSession: userId ? { user: { id: userId } } : null } as SessionRequest;
}

describe('UserVisibilityService.excluded', () => {
  it('hides test accounts and both directions of a block', async () => {
    const db = fakeDb([
      { userId: 'viewer', blockedUserId: 'blocked-by-viewer' },
      { userId: 'blocks-viewer', blockedUserId: 'viewer' },
    ]);
    const service = new UserVisibilityService(db as unknown as PrismaClient, normalMode);
    await expect(service.excluded(request('viewer'))).resolves.toEqual([
      'test-account',
      'blocked-by-viewer',
      'blocks-viewer',
    ]);
    expect(db.block.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ userId: 'viewer' }, { blockedUserId: 'viewer' }] } }),
    );
  });

  it('reads the relationships once per request and again for another request', async () => {
    const db = fakeDb([]);
    const service = new UserVisibilityService(db as unknown as PrismaClient, normalMode);
    const req = request('viewer');
    await Promise.all([service.excluded(req), service.excluded(req), service.excluded(req)]);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(db.block.findMany).toHaveBeenCalledTimes(1);
    await service.excluded(request('viewer'));
    expect(db.block.findMany).toHaveBeenCalledTimes(2);
  });

  it('rereads inside a transaction and after the request user changes', async () => {
    const db = fakeDb([]);
    const tx = fakeDb([{ userId: 'viewer', blockedUserId: 'new-block' }]);
    const service = new UserVisibilityService(db as unknown as PrismaClient, normalMode);
    const req = request('viewer');
    await service.excluded(req);
    await expect(service.excluded(req, tx as unknown as Prisma.TransactionClient)).resolves.toContain(
      'new-block',
    );
    req.gfSession = { user: { id: 'other' } } as SessionRequest['gfSession'];
    await service.excluded(req);
    expect(db.block.findMany).toHaveBeenCalledTimes(2);
  });

  it('skips blocks for anonymous viewers and test accounts while test auth is on', async () => {
    const db = fakeDb([]);
    const service = new UserVisibilityService(
      db as unknown as PrismaClient,
      {
        demoMode: false,
        testAuthEnabled: true,
      } as AppConfig,
    );
    await expect(service.excluded(request())).resolves.toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.block.findMany).not.toHaveBeenCalled();
  });
});
