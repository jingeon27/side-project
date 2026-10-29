import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../config/app.config';
import type { PrismaClient } from '../../generated/prisma';
import type { ChatEvents } from '../events/chat.events';
import { ChatAccessService } from './chat-access.service';

function setup() {
  const findFirst = vi.fn();
  const events = { canAccess: async (_userId: string, _id: string) => false };
  new ChatAccessService(
    { chatConversation: { findFirst } } as unknown as PrismaClient,
    {} as AppConfig,
    events as ChatEvents,
  );
  return { findFirst, events };
}

describe('SSE conversation visibility', () => {
  it('가시성 404는 권한 거부로 처리한다', async () => {
    const { findFirst, events } = setup();
    findFirst.mockResolvedValue(null);
    await expect(events.canAccess('viewer', 'missing')).resolves.toBe(false);
  });

  it('DB 장애를 권한 거부로 숨기지 않고 전달 실패 계측으로 보낸다', async () => {
    const { findFirst, events } = setup();
    const error = new Error('database-unavailable');
    findFirst.mockRejectedValue(error);
    await expect(events.canAccess('viewer', 'conversation')).rejects.toBe(error);
  });
});
