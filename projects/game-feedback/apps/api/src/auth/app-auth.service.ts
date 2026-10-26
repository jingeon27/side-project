import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

import { hash, token } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { parse } from '../common/validation';
import { PrismaClient } from '../generated/prisma';
import { type TAppExchangeDto } from './auth-input.dto';
import { assertIdentityNotBanned } from './banned-identity';
import { SessionService } from './session.service';
import type { SessionRequest } from './session.types';
import { SocialIdentityService } from './social-identity.service';

@Injectable()
export class AppAuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SocialIdentityService) private readonly identities: SocialIdentityService,
  ) {}
  async issueTicket(subject: string, challenge: string, provider: TSocialProvider = 'google') {
    const code = token();
    await this.db.appLoginTicket.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.db.appLoginTicket.create({
      data: {
        codeHash: hash(code),
        challenge,
        subject,
        provider,
        expiresAt: new Date(Date.now() + 120000),
      },
    });
    return code;
  }
  async exchange(req: SessionRequest, res: Response, body: TAppExchangeDto) {
    const { code, verifier } = body;
    const codeHash = hash(code);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const ticket = await this.db.appLoginTicket.findUnique({ where: { codeHash } });
    if (!ticket || ticket.challenge !== challenge || ticket.expiresAt <= new Date())
      throw new ApiError(400, 'APP_LOGIN_INVALID', '로그인 요청이 만료되었거나 올바르지 않습니다.');
    const consumed = await this.db.appLoginTicket.deleteMany({
      where: {
        codeHash,
        challenge,
        expiresAt: { gt: new Date() },
      },
    });
    if (consumed.count !== 1) throw new ApiError(400, 'APP_LOGIN_INVALID', '이미 사용된 로그인 요청입니다.');
    const provider = parse(SocialProviderSchema, ticket.provider);
    const user = await this.identities.findUser(provider, ticket.subject);
    if (!user) await assertIdentityNotBanned(this.db, provider, ticket.subject);
    await this.sessions.issueSession(req, res, user?.id ?? null, user ? null : ticket.subject, { provider });
    return this.sessions.session(req);
  }
}
