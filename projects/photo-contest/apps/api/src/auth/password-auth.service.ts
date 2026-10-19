import { AuthRepository } from './auth.repository';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { Prisma } from '../../generated/prisma';
import { sha256Hex } from '../common/crypto';
import { ERROR_CODE, fail } from '../common/errors';
import {
  AUTH_ATTEMPT_WINDOW_MS,
  AUTH_LOGIN_ID_LIMIT,
  AUTH_LOGIN_IP_LIMIT,
  AUTH_REGISTER_IP_LIMIT,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  TEXT_LIMIT,
} from '../config/limits';
import { hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';
import { USER_VIEW_SELECT } from './user-view';

const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, '아이디는 영문·숫자·밑줄 3~24자로 입력해 주세요.');
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, '비밀번호는 15자 이상 입력해 주세요.')
  .max(PASSWORD_MAX_LENGTH, '비밀번호는 128자 이내로 입력해 주세요.');
const loginSchema = z.object({
  loginId: loginIdSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
const registerSchema = z.object({
  loginId: loginIdSchema,
  password: passwordSchema,
  nickname: z
    .string()
    .trim()
    .min(1, '닉네임을 입력해 주세요.')
    .max(TEXT_LIMIT.NICKNAME, '닉네임은 24자 이내로 입력해 주세요.'),
});
const LOGIN_FAILED = '아이디 또는 비밀번호를 확인해 주세요.';

@Injectable()
export class PasswordAuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessions: SessionService,
  ) {}

  async register(input: unknown, req: Request, res: Response) {
    await this.throttle(`register:ip:${req.ip ?? req.socket.remoteAddress}`, AUTH_REGISTER_IP_LIMIT);
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? '입력 내용을 확인해 주세요.');
    const { loginId, password, nickname } = parsed.data;
    const passwordHash = await hashPassword(password);
    const user = await this.repository
      .createUser({
        data: {
          provider: 'password',
          providerId: loginId,
          nickname,
          credential: { create: { loginId, passwordHash } },
        },
        select: USER_VIEW_SELECT,
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          fail('이미 사용 중인 아이디입니다.', ERROR_CODE.CONFLICT);
        throw error;
      });
    await this.sessions.end(req, res);
    await this.sessions.start(res, user.id);
    return user;
  }

  async login(input: unknown, req: Request, res: Response) {
    await this.throttle(`login:ip:${req.ip ?? req.socket.remoteAddress}`, AUTH_LOGIN_IP_LIMIT);
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) fail(LOGIN_FAILED, ERROR_CODE.UNAUTHENTICATED);
    const { loginId, password } = parsed.data;
    await this.throttle(`login:id:${loginId}`, AUTH_LOGIN_ID_LIMIT);
    const credential = await this.repository.findUniquePasswordCredential({
      where: { loginId },
      include: { user: { select: USER_VIEW_SELECT } },
    });
    const valid = await verifyPassword(password, credential?.passwordHash);
    if (!valid || !credential) fail(LOGIN_FAILED, ERROR_CODE.UNAUTHENTICATED);
    await this.sessions.end(req, res);
    await this.sessions.start(res, credential.userId);
    return credential.user;
  }

  private async throttle(key: string, limit: number) {
    const now = Date.now();
    const bucket = Math.floor(now / AUTH_ATTEMPT_WINDOW_MS);
    const attempt = await this.repository.upsertAuthAttempt({
      where: { keyHash: sha256Hex(`${key}:${bucket}`) },
      create: {
        keyHash: sha256Hex(`${key}:${bucket}`),
        expiresAt: new Date((bucket + 1) * AUTH_ATTEMPT_WINDOW_MS),
      },
      update: { count: { increment: 1 } },
    });
    if (attempt.count > limit)
      fail('로그인 요청이 너무 많습니다. 15분 뒤 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
  }
}
