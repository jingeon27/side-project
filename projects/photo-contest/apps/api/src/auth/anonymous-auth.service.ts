import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Database } from '../database/database.service';
import { PasswordAuthService } from './password-auth.service';
import { SessionService } from './session.service';
import { USER_VIEW_SELECT } from './user-view';

@Injectable()
export class AnonymousAuthService {
  constructor(
    private readonly db: Database,
    private readonly sessions: SessionService,
    private readonly attempts: PasswordAuthService,
  ) {}

  async start(req: Request, res: Response) {
    const viewer = await this.sessions.viewer(req);
    if (viewer) return viewer;
    await this.attempts.consumeRequest('anonymous', req);
    const identity = randomUUID();
    const user = await this.db.user.create({
      data: {
        provider: 'anonymous',
        providerId: identity,
        nickname: `익명 ${identity.slice(0, 8)}`,
      },
      select: USER_VIEW_SELECT,
    });
    await this.sessions.start(res, user.id);
    return user;
  }
}
