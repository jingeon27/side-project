import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Prisma } from '../../generated/prisma';
import { sha256Hex } from '../common/crypto';
import { ERROR_CODE, fail } from '../common/errors';
import { clientAddressKey } from '../common/http/client-address';
import {
  AUTH_ATTEMPT_WINDOW_MS,
  AUTH_LOGIN_ID_LIMIT,
  AUTH_LOGIN_IP_LIMIT,
  AUTH_REGISTER_IP_LIMIT,
} from '../config/limits';
import { Database } from '../database/database.service';
import { type TLoginWithPasswordDto, type TRegisterWithPasswordDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';
import { USER_VIEW_SELECT } from './user-view';

const LOGIN_FAILED = '아이디 또는 비밀번호를 확인해 주세요.';
const THROTTLED = '로그인 요청이 너무 많습니다. 15분 뒤 다시 시도해 주세요.';

/** Express가 고정 프록시 정책으로 확인한 요청 주소. IPv6는 /64로 묶는다. */
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

  async register(input: TRegisterWithPasswordDto, req: Request, res: Response) {
    const { loginId, password, nickname } = input;
    const passwordHash = await hashPassword(password);
    const viewer = await this.sessions.viewer(req);
    const data = {
      provider: 'password',
      providerId: loginId,
      nickname,
      credential: { create: { loginId, passwordHash } },
    };
    // 익명 상태에서 가입하면 공개 그룹과 작성한 콘텐츠의 소유권을 이어 간다.
    const registration =
      viewer?.provider === 'anonymous'
        ? this.db.user.update({
            where: { id: viewer.id, provider: 'anonymous' },
            data,
            select: USER_VIEW_SELECT,
          })
        : this.db.user.create({ data, select: USER_VIEW_SELECT });
    const user = await registration.catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        fail('이미 사용 중인 아이디입니다.', ERROR_CODE.CONFLICT);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        fail('계정 상태가 변경됐습니다. 다시 로그인해 주세요.', ERROR_CODE.CONFLICT);
      throw error;
    });
    await this.sessions.end(req, res);
    await this.sessions.start(res, user.id);
    return user;
  }

  async login(input: TLoginWithPasswordDto, req: Request, res: Response) {
    const { loginId, password } = input;
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

  consumeRequest(kind: 'register' | 'login' | 'anonymous', req: Request) {
    return this.throttle(
      `${kind}:ip:${clientAddress(req)}`,
      kind === 'login' ? AUTH_LOGIN_IP_LIMIT : AUTH_REGISTER_IP_LIMIT,
    );
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
