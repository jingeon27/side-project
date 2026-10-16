import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { AppExchangeInputSchema } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import { hash, token } from '../common/crypto';
import { parse } from '../common/validation';
import { ApiError } from '../common/http/api-error';
import type { SessionRequest } from './session.types';
import { SessionService } from './session.service';

@Injectable()
export class AppAuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}
  async issueTicket(subject: string, challenge: string) {
    const code = token();
    await this.db.appLoginTicket.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.db.appLoginTicket.create({
      data: { codeHash: hash(code), challenge, subject, expiresAt: new Date(Date.now() + 120_000) },
    });
    return code;
  }
  async exchange(req: SessionRequest, res: Response, body: unknown) {
    const { code, verifier } = parse(AppExchangeInputSchema, body);
    const codeHash = hash(code);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const ticket = await this.db.appLoginTicket.findUnique({ where: { codeHash } });
    if (!ticket || ticket.challenge !== challenge || ticket.expiresAt <= new Date())
      throw new ApiError(400, 'APP_LOGIN_INVALID', '로그인 요청이 만료되었거나 올바르지 않습니다.');
    const consumed = await this.db.appLoginTicket.deleteMany({
      where: { codeHash, challenge, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new ApiError(400, 'APP_LOGIN_INVALID', '이미 사용된 로그인 요청입니다.');
    const user = await this.db.user.findUnique({ where: { googleSubject: ticket.subject } });
    await this.sessions.issueSession(req, res, user?.id ?? null, user ? null : ticket.subject);
    return this.sessions.session(req);
  }
}
