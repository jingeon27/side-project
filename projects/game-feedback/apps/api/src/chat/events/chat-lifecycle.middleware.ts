import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import type { SessionRequest } from '../../auth/session/session.types';
import { PrismaClient } from '../../generated/prisma';
import { ChatEvents } from './chat.events';

@Injectable()
export class ChatLifecycleMiddleware implements NestMiddleware {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}

  async use(req: SessionRequest, res: Response, next: NextFunction) {
    try {
      // Capture before a controller rotates the session or deletes its user.
      const userId = req.gfSession?.userId;
      const sessionHash = req.gfSession?.tokenHash;
      let deletedPeers: string[] = [];
      if (req.method === 'DELETE' && req.path === '/api/me' && userId) {
        deletedPeers = (
          await this.db.chatConversation.findMany({
            where: { OR: [{ firstUserId: userId }, { secondUserId: userId }] },
            select: { firstUserId: true, secondUserId: true },
          })
        ).map((row) => (row.firstUserId === userId ? row.secondUserId : row.firstUserId));
      }
      res.once('finish', () => {
        // Publish only after successful mutations have committed.
        if (res.statusCode !== 200 || !userId) return;
        if (
          req.method === 'POST' &&
          [
            '/api/auth/logout',
            '/api/auth/demo',
            '/api/auth/test-login',
            '/api/auth/onboard',
            '/api/auth/app/exchange',
          ].includes(req.path) &&
          sessionHash
        )
          this.events.closeSession(sessionHash);
        if (req.method === 'DELETE' && req.path === '/api/me') {
          this.events.closeUser(userId);
          void this.events.publish(deletedPeers, null);
        }
        if (
          req.method === 'POST' &&
          req.path === '/api/blocks' &&
          typeof req.body?.blockedUserId === 'string'
        ) {
          void this.events.publish([userId, req.body.blockedUserId], null);
        }
        if (req.method === 'DELETE' && req.path.startsWith('/api/blocks/')) {
          void this.events.publish([userId, req.path.slice('/api/blocks/'.length)], null);
        }
      });
      next();
    } catch (error) {
      next(error);
    }
  }
}
