import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { Prisma } from '../../generated/prisma';
import { sha256Hex } from '../common/crypto';
import { ERROR_CODE, fail } from '../common/errors';
import { clientAddressKey } from '../common/http/client-address';
import {
  AUTH_ATTEMPT_WINDOW_MS,
  AUTH_LOGIN_ID_LIMIT,
  AUTH_LOGIN_IP_LIMIT,
  AUTH_REGISTER_IP_LIMIT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  TEXT_LIMIT,
} from '../config/limits';
import { Database } from '../database/database.service';
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
const THROTTLED = '로그인 요청이 너무 많습니다. 15분 뒤 다시 시도해 주세요.';

/** Express가 TRUST_PROXY_HOPS로 확인한 요청 주소. IPv6는 /64로 묶는다. */
function clientAddress(req: Request) {
  return clientAddressKey(req.ip ?? req.socket.remoteAddress);
}

function bucketOf(key: string) {
  const bucket = Math.floor(Date.now() / AUTH_ATTEMPT_WINDOW_MS);
  return {
    keyHash: sha256Hex(`${key}:${bucket}`),
    expiresAt: new Date((bucket + 1) * AUTH_ATTEMPT_WINDOW_MS),
  };
}

@Injectable()
export class PasswordAuthService {
  constructor(
    private readonly db: Database,
    private readonly sessions: SessionService,
  ) {}

  async register(input: unknown, req: Request, res: Response) {
    await this.throttle(`register:ip:${clientAddress(req)}`, AUTH_REGISTER_IP_LIMIT);
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? '입력 내용을 확인해 주세요.');
    const { loginId, password, nickname } = parsed.data;
    const passwordHash = await hashPassword(password);
    const user = await this.db.user
      .create({
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
    await this.throttle(`login:ip:${clientAddress(req)}`, AUTH_LOGIN_IP_LIMIT);
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) fail(LOGIN_FAILED, ERROR_CODE.UNAUTHENTICATED);
    const { loginId, password } = parsed.data;
    // 아이디 버킷은 실패만 센다. 성공한 로그인이 한도를 쓰거나 남이 성공 횟수로 계정을 잠그지 못한다.
    const idKey = `login:id:${loginId}`;
    if ((await this.attempts(idKey)) >= AUTH_LOGIN_ID_LIMIT) fail(THROTTLED, ERROR_CODE.RATE_LIMITED);
    const credential = await this.db.passwordCredential.findUnique({
      where: { loginId },
      include: { user: { select: USER_VIEW_SELECT } },
    });
    const valid = await verifyPassword(password, credential?.passwordHash);
    if (!valid || !credential) {
      await this.count(idKey);
      fail(LOGIN_FAILED, ERROR_CODE.UNAUTHENTICATED);
    }
    await this.sessions.end(req, res);
    await this.sessions.start(res, credential.userId);
    return credential.user;
  }

  private async throttle(key: string, limit: number) {
    if ((await this.count(key)) > limit) fail(THROTTLED, ERROR_CODE.RATE_LIMITED);
  }

  /** 지금 15분 버킷에 기록된 횟수 */
  private async attempts(key: string) {
    const attempt = await this.db.authAttempt.findUnique({ where: { keyHash: bucketOf(key).keyHash } });
    return attempt?.count ?? 0;
  }

  /** 지금 버킷의 횟수를 하나 올리고 올린 값을 돌려준다. 여러 API 인스턴스가 같은 행을 센다. */
  private async count(key: string) {
    const { keyHash, expiresAt } = bucketOf(key);
    const attempt = await this.db.authAttempt.upsert({
      where: { keyHash },
      create: { keyHash, expiresAt },
      update: { count: { increment: 1 } },
    });
    return attempt.count;
  }
}
