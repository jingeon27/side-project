import { Injectable } from '@nestjs/common';
import { User } from '../generated/prisma';
import type { Request, Response } from 'express';
import { Database } from './database';
import { hash, token } from './contest.service';
import { fail, textValue } from './policy';
export function developmentLoginEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_LOGIN === 'true';
}
export function webOrigin() {
  const value = process.env.WEB_ORIGIN ?? 'http://localhost:3200';
  return new URL(value).origin;
}
@Injectable()
export class AuthService {
  constructor(private readonly db: Database) {}
  async user(req: Request): Promise<User | null> {
    const value: unknown = req.cookies?.contest_session;
    if (typeof value !== 'string') return null;
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash(value) },
      include: { user: true },
    });
    return session && session.expiresAt > new Date() ? session.user : null;
  }
  async session(user: User, res: Response) {
    const value = token();
    await this.db.session.create({
      data: { tokenHash: hash(value), userId: user.id, expiresAt: new Date(Date.now() + 30 * 86400_000) },
    });
    res.cookie('contest_session', value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 86400_000,
      path: '/',
    });
  }
  async logout(req: Request, res: Response) {
    const value: unknown = req.cookies?.contest_session;
    if (typeof value === 'string') await this.db.session.deleteMany({ where: { tokenHash: hash(value) } });
    res.clearCookie('contest_session', {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
    });
  }
  async devLogin(nickname: unknown, res: Response) {
    if (!developmentLoginEnabled()) fail('개발 로그인이 비활성화되어 있습니다.', 'FORBIDDEN');
    const name = textValue(nickname, 24, '닉네임');
    const user = await this.db.user.upsert({
      where: { provider_providerId: { provider: 'dev', providerId: name } },
      create: { provider: 'dev', providerId: name, nickname: name },
      update: {},
    });
    await this.session(user, res);
  }
  provider(name: string) {
    if (name !== 'google' && name !== 'kakao') fail('지원하지 않는 로그인입니다.');
    const prefix = name.toUpperCase();
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    if (!clientId) fail('이 소셜 로그인은 아직 설정되지 않았습니다.', 'UNAVAILABLE');
    return {
      name,
      clientId,
      secret: process.env[`${prefix}_CLIENT_SECRET`],
      redirect: `${webOrigin()}/backend/auth/${name}/callback`,
      authorize:
        name === 'google'
          ? 'https://accounts.google.com/o/oauth2/v2/auth'
          : 'https://kauth.kakao.com/oauth/authorize',
      token:
        name === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://kauth.kakao.com/oauth/token',
      profile:
        name === 'google'
          ? 'https://openidconnect.googleapis.com/v1/userinfo'
          : 'https://kapi.kakao.com/v2/user/me',
    };
  }
  async start(providerName: string, res: Response) {
    const provider = this.provider(providerName);
    const state = token();
    const verifier = token();
    await this.db.oAuthAttempt.create({
      data: {
        stateHash: hash(state),
        provider: providerName,
        verifier,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    res.cookie('contest_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60_000,
      path: '/',
    });
    const url = new URL(provider.authorize);
    url.search = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirect,
      response_type: 'code',
      state,
      code_challenge: Buffer.from(hash(verifier), 'hex').toString('base64url'),
      code_challenge_method: 'S256',
      ...(providerName === 'google' ? { scope: 'openid profile', prompt: 'select_account' } : {}),
    }).toString();
    res.redirect(url.toString());
  }
  async callback(providerName: string, req: Request, res: Response) {
    const provider = this.provider(providerName);
    const state = req.query.state;
    const code = req.query.code;
    if (typeof state !== 'string' || typeof code !== 'string' || req.cookies?.contest_oauth_state !== state)
      fail('로그인 요청을 확인할 수 없습니다.', 'FORBIDDEN');
    const attempt = await this.db.oAuthAttempt.findUnique({ where: { stateHash: hash(state) } });
    if (!attempt || attempt.provider !== providerName || attempt.expiresAt < new Date())
      fail('로그인 요청이 만료되었습니다.', 'FORBIDDEN');
    const consumed = await this.db.oAuthAttempt.deleteMany({ where: { stateHash: hash(state) } });
    if (consumed.count !== 1) fail('이미 사용한 로그인 요청입니다.', 'FORBIDDEN');
    res.clearCookie('contest_oauth_state', { path: '/' });
    const response = await fetch(provider.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: provider.clientId,
        redirect_uri: provider.redirect,
        code,
        code_verifier: attempt.verifier,
        ...(provider.secret ? { client_secret: provider.secret } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const credentials = (await response.json()) as { access_token?: string };
    if (!response.ok || !credentials.access_token) fail('소셜 인증에 실패했습니다.', 'UNAUTHENTICATED');
    const profileResponse = await fetch(provider.profile, {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const profile = (await profileResponse.json()) as {
      sub?: string;
      id?: number;
      name?: string;
      picture?: string;
      properties?: { nickname?: string; profile_image?: string };
    };
    if (!profileResponse.ok) fail('프로필을 확인할 수 없습니다.', 'UNAUTHENTICATED');
    const providerId = providerName === 'google' ? profile.sub : profile.id?.toString();
    if (!providerId) fail('사용자를 확인할 수 없습니다.', 'UNAUTHENTICATED');
    const nickname = (profile.name ?? profile.properties?.nickname ?? '친구').slice(0, 24);
    const avatar = profile.picture ?? profile.properties?.profile_image;
    const user = await this.db.user.upsert({
      where: { provider_providerId: { provider: providerName, providerId } },
      create: { provider: providerName, providerId, nickname, avatar },
      update: { nickname, avatar },
    });
    await this.session(user, res);
    res.redirect(`${webOrigin()}/`);
  }
}
