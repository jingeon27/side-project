import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { randomToken, sha256Hex } from '../../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../../common/errors';
import { readCookie } from '../../common/http/cookie-header';
import { SESSION_TTL_MS } from '../../config/limits';
import { Database } from '../../database/database.service';
import { USER_VIEW_SELECT } from '../user-view';
import { authCookieOptions, sessionCookieName } from './auth-cookie';

// randomToken()이 만드는 32바이트 base64url. 다른 모양은 DB를 조회하지 않고 비로그인으로 본다.
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface IViewer {
  id: string;
  nickname: string;
  avatar: string | null;
  needsOnboarding?: boolean;
  avatarUploadId?: string | null;
  provider?: string;
}

function sessionToken(req: Request) {
  const token = readCookie(req.headers.cookie, sessionCookieName());
  return token && SESSION_TOKEN.test(token) ? token : undefined;
}

/** 세션 쿠키는 cookie-parser 없이 요청 헤더 원문에서 직접 읽는다. Authorization 헤더는 보지 않는다. */
@Injectable()
export class SessionService {
  // 필드 리졸버마다 세션을 다시 조회하지 않도록 요청 객체마다 한 번만 찾는다.
  private readonly viewers = new WeakMap<Request, Promise<IViewer | null>>();

  constructor(private readonly db: Database) {}

  viewer(req: Request): Promise<IViewer | null> {
    const cached = this.viewers.get(req);
    if (cached) return cached;
    const pending = this.findViewer(sessionToken(req), req.headers['x-expected-viewer-id']);
    this.viewers.set(req, pending);
    return pending;
  }

  async requireViewer(req: Request): Promise<IViewer> {
    const viewer = (await this.viewer(req)) ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
    if (viewer.needsOnboarding) fail('약관 동의와 프로필 설정을 먼저 완료해 주세요.', ERROR_CODE.FORBIDDEN);
    return viewer;
  }

  async requireSessionKey(req: Request) {
    const viewer = await this.requireViewer(req);
    const token = sessionToken(req);
    if (!token) fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
    return { userId: viewer.id, key: sha256Hex(token) };
  }

  /** 새 세션을 만들고 쿠키로 내려준다. DB에는 토큰 해시만 저장한다. */
  async start(res: Response, userId: string) {
    const token = randomToken();
    await this.db.session.create({
      data: {
        tokenHash: sha256Hex(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    res.cookie(sessionCookieName(), token, authCookieOptions(SESSION_TTL_MS));
  }

  async end(req: Request, res: Response) {
    const token = sessionToken(req);
    if (token) await this.db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
    res.clearCookie(sessionCookieName(), authCookieOptions());
  }

  private async findViewer(
    token: string | undefined,
    expectedViewer: string | string[] | undefined,
  ): Promise<IViewer | null> {
    const session = token
      ? await this.db.session.findUnique({
          where: { tokenHash: sha256Hex(token) },
          select: { expiresAt: true, user: { select: USER_VIEW_SELECT } },
        })
      : null;
    const viewer = session && session.expiresAt > new Date() ? session.user : null;
    // 다른 탭에서 계정이 바뀌어도 오래된 화면이 새 계정의 권한으로 쓰기를 보내지 않게 한다.
    if (expectedViewer !== undefined && expectedViewer !== (viewer?.id ?? 'anonymous'))
      fail(
        '로그인한 계정이 변경됐습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
        ERROR_CODE.UNAUTHENTICATED,
      );
    return viewer;
  }
}
