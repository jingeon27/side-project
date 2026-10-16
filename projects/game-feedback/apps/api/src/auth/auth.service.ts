import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { DemoInputSchema, OnboardInputSchema, TestLoginInputSchema } from '@game-feedback/contracts';
import type { SessionRequest } from './session.types';
import { SessionService } from './session.service';
import { requireUser } from './session-access';
import { parse } from '../common/validation';
import { ApiError } from '../common/http/api-error';
import { COOKIE, cookies, setCookie } from '../common/http/cookies';
import { hash, token } from '../common/crypto';
import { authorDto } from '../users/user.presenter';
import { seed, TEST_ACCOUNT_FIXTURES } from '../seed';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}
  async demo(req: SessionRequest, res: Response, body: unknown) {
    if (!this.config.demoMode) throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
    const input = parse(DemoInputSchema, body);
    const user = await this.db.user.upsert({
      where: { demoKey: `demo:${input.nickname.toLocaleLowerCase()}` },
      update: {},
      create: {
        nickname: input.nickname,
        demoKey: `demo:${input.nickname.toLocaleLowerCase()}`,
        termsVersion: 'demo',
        ageConfirmed: true,
      },
    });
    await this.sessions.issueSession(req, res, user.id);
    return this.sessions.session(req);
  }

  private requireDemo() {
    if (!this.config.demoMode || this.config.production)
      throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
  }

  async testAccounts() {
    this.requireDemo();
    await seed(this.db, true);
    const users = await this.db.user.findMany({
      where: { OR: TEST_ACCOUNT_FIXTURES.map((account) => ({ id: account.id, demoKey: account.demoKey })) },
    });
    return {
      items: TEST_ACCOUNT_FIXTURES.flatMap((account) => {
        const user = users.find((candidate) => candidate.id === account.id);
        return user
          ? [{ ...authorDto(user), isTestAccount: true, role: user.role, description: account.description }]
          : [];
      }),
    };
  }

  async testLogin(req: SessionRequest, res: Response, body: unknown) {
    this.requireDemo();
    const { accountId } = parse(TestLoginInputSchema, body);
    const fixture = TEST_ACCOUNT_FIXTURES.find((account) => account.id === accountId);
    if (!fixture) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '사용할 수 없는 테스트 계정입니다.');
    await seed(this.db, true);
    const user = await this.db.user.findFirst({ where: { id: fixture.id, demoKey: fixture.demoKey } });
    if (!user) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '테스트 계정을 찾을 수 없습니다.');
    await this.sessions.issueSession(req, res, user.id);
    return this.sessions.session(req);
  }

  async google(req: Request, res: Response) {
    if (!this.config.identityProvider)
      throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'Google 로그인이 아직 설정되지 않았습니다.');
    const state = token(),
      nonce = token(),
      verifier = token();
    await this.db.oAuthAttempt.create({
      data: { stateHash: hash(state), nonce, verifier, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
    });
    setCookie(res, 'gamefeedback_oauth', state, 1000 * 60 * 10, this.config.production);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    res.redirect(this.config.identityProvider.authorizationUrl({ state, nonce, challenge }));
  }

  async googleCallback(req: SessionRequest, res: Response) {
    if (!this.config.identityProvider)
      throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'Google 로그인이 아직 설정되지 않았습니다.');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || !code || cookies(req).gamefeedback_oauth !== state)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청을 확인할 수 없습니다.');
    const attempts = await this.db.oAuthAttempt.deleteMany({
      where: { stateHash: hash(state), expiresAt: { lte: new Date() } },
    });
    void attempts;
    const attempt = await this.db.oAuthAttempt.findUnique({ where: { stateHash: hash(state) } });
    if (!attempt) throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 만료되었습니다.');
    // Consume before exchanging the one-use code, including failures.
    const consumed = await this.db.oAuthAttempt.deleteMany({ where: { stateHash: hash(state) } });
    if (consumed.count !== 1)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 이미 사용되었습니다.');
    setCookie(res, 'gamefeedback_oauth', '', 0, this.config.production);
    const subject = await this.config.identityProvider.exchange(code, attempt.verifier, attempt.nonce);
    const user = await this.db.user.findUnique({ where: { googleSubject: subject } });
    if (user && process.env.GF_ADMIN_GOOGLE_SUB === subject && user.role !== 'ADMIN') {
      await this.db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    }
    await this.sessions.issueSession(req, res, user?.id ?? null, user ? null : subject);
    res.redirect(`${this.config.webOrigin}/ko${user ? '' : '?onboard=1'}`);
  }

  async onboard(req: SessionRequest, res: Response, body: unknown) {
    const input = parse(OnboardInputSchema, body),
      subject = req.gfSession?.pendingSubject;
    if (!subject) throw new ApiError(401, 'ONBOARDING_REQUIRED', 'Google 로그인 후 가입을 완료해주세요.');
    const user = await this.db.user.upsert({
      where: { googleSubject: subject },
      update: {},
      create: {
        googleSubject: subject,
        nickname: input.nickname,
        termsVersion: '2026-10-16',
        ageConfirmed: true,
        role: process.env.GF_ADMIN_GOOGLE_SUB === subject ? 'ADMIN' : 'USER',
      },
    });
    await this.sessions.issueSession(req, res, user.id);
    return this.sessions.session(req);
  }

  async logout(req: SessionRequest, res: Response) {
    const raw = cookies(req)[COOKIE];
    if (raw) await this.db.session.deleteMany({ where: { tokenHash: hash(raw) } });
    setCookie(res, COOKIE, '', 0, this.config.production);
    return { ok: true };
  }

  async deleteAccount(req: SessionRequest, res: Response) {
    const u = requireUser(req);
    await this.db.$transaction(async (tx) => {
      await tx.post.deleteMany({ where: { authorId: u.id } });
      await tx.answer.deleteMany({ where: { authorId: u.id } });
      await tx.comment.deleteMany({ where: { authorId: u.id } });
      await tx.notification.deleteMany({ where: { actorId: u.id } });
      await tx.user.delete({ where: { id: u.id } });
    });
    setCookie(res, COOKIE, '', 0, this.config.production);
    return { ok: true };
  }
}
