import { createHash, randomBytes, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { GameProfile } from '@game-feedback/contracts';

export class ApiError extends HttpException {
  constructor(status: number, errorCode: string, message: string) {
    super({ errorCode, message }, status);
  }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const COOKIE = 'gamefeedback_session';
export function cookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((v) => v.trim().split('='))
      .filter((v) => v.length === 2),
  );
}
export function setCookie(res: Response, name: string, value: string, maxAge: number, production: boolean) {
  res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge });
}
export function assertOrigin(req: Request, webOrigin: string) {
  const origin = req.headers.origin;
  if (origin !== webOrigin || req.headers['sec-fetch-site'] === 'cross-site')
    throw new ApiError(403, 'INVALID_ORIGIN', '요청 출처를 확인할 수 없습니다.');
}
export function assertDatabaseUrl(value: string | undefined, env = process.env.NODE_ENV) {
  if (!value) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL.');
  const database = parsed.pathname.slice(1);
  if (parsed.searchParams.has('options'))
    throw new Error('Database options overriding schema isolation are forbidden.');
  if (decodeURIComponent(parsed.username) !== 'game_feedback')
    throw new Error('Use the isolated game_feedback database user.');
  if (env === 'test') {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.port !== '55444')
      throw new Error('Tests require loopback PostgreSQL port 55444.');
    if (
      database !== 'game_feedback_test' ||
      !/^gf_test_[a-z0-9_]+$/.test(parsed.searchParams.get('schema') ?? '')
    )
      throw new Error('Tests require game_feedback_test and an isolated gf_test_ schema.');
  } else if (database !== 'game_feedback')
    throw new Error('Only the dedicated game_feedback database is allowed.');
  return value;
}
export function encodeCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString('base64url');
}
export function decodeCursor(value?: string): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string' ||
      !parsed[1] ||
      Number.isNaN(Date.parse(parsed[0]))
    )
      throw new Error();
    return { createdAt: new Date(parsed[0]), id: parsed[1] };
  } catch {
    throw new ApiError(400, 'INVALID_CURSOR', '목록 위치가 올바르지 않습니다.');
  }
}
export interface IdentityProvider {
  authorizationUrl(input: { state: string; nonce: string; challenge: string }): string;
  exchange(code: string, verifier: string, nonce: string): Promise<string>;
}
export class GoogleIdentityProvider implements IdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}
  authorizationUrl(input: { state: string; nonce: string; challenge: string }) {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.challenge,
      code_challenge_method: 'S256',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }
  async exchange(code: string, verifier: string, nonce: string) {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      const data = (await response.json()) as { id_token?: string };
      if (!response.ok || !data.id_token) throw new Error('Token exchange failed');
      const parts = data.id_token.split('.');
      if (parts.length !== 3) throw new Error('Invalid ID token');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as {
        alg?: string;
        kid?: string;
      };
      if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid algorithm');
      const jwksResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
        signal: AbortSignal.timeout(10000),
      });
      if (!jwksResponse.ok) throw new Error('Key discovery failed');
      const jwks = (await jwksResponse.json()) as { keys: (JsonWebKey & { kid?: string })[] };
      const jwk = jwks.keys.find((key) => key.kid === header.kid);
      if (
        !jwk ||
        !verify(
          'RSA-SHA256',
          Buffer.from(`${parts[0]}.${parts[1]}`),
          createPublicKey({ key: jwk, format: 'jwk' }),
          Buffer.from(parts[2], 'base64url'),
        )
      )
        throw new Error('Invalid signature');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
        sub?: string;
        iss?: string;
        aud?: string | string[];
        azp?: string;
        exp?: number;
        iat?: number;
        nonce?: string;
      };
      const now = Date.now() / 1000;
      const audience = Array.isArray(claims.aud)
        ? claims.aud.includes(this.clientId) && claims.azp === this.clientId
        : claims.aud === this.clientId;
      if (
        !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') ||
        !audience ||
        !claims.exp ||
        claims.exp < now ||
        !claims.iat ||
        claims.iat > now + 60 ||
        claims.nonce !== nonce ||
        !claims.sub
      )
        throw new Error('Invalid claims');
      return claims.sub;
    } catch {
      throw new ApiError(502, 'OAUTH_FAILED', 'Google 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  }
}
export interface ProfileProvider {
  lookup(playerTag: string): Promise<GameProfile>;
}
export class SupercellProfileProvider implements ProfileProvider {
  constructor(private readonly apiToken: string) {}
  async lookup(playerTag: string): Promise<GameProfile> {
    try {
      const response = await fetch(
        `https://api.clashroyale.com/v1/players/${encodeURIComponent(playerTag)}`,
        {
          headers: { Authorization: `Bearer ${this.apiToken}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.status === 404)
        throw new ApiError(404, 'PLAYER_NOT_FOUND', '플레이어를 찾을 수 없습니다.');
      if (!response.ok) throw new Error('Upstream failed');
      const p = (await response.json()) as {
        tag: string;
        name: string;
        trophies: number;
        bestTrophies: number;
        arena?: { name: string };
        clan?: { name: string };
        currentDeck?: { id: number; name: string; level: number; iconUrls?: { medium?: string } }[];
      };
      return {
        playerTag: p.tag,
        name: p.name,
        trophies: p.trophies,
        bestTrophies: p.bestTrophies,
        arena: p.arena?.name ?? '',
        clan: p.clan?.name ?? null,
        deck: (p.currentDeck ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          iconUrl: c.iconUrls?.medium ?? null,
        })),
        verification: 'UNVERIFIED',
        source: 'SUPERCELL',
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        'PROFILE_UNAVAILABLE',
        '게임 프로필을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }
}
export class DemoProfileProvider implements ProfileProvider {
  async lookup(playerTag: string): Promise<GameProfile> {
    return {
      playerTag,
      name: '샘플 플레이어',
      trophies: 6850,
      bestTrophies: 7023,
      arena: '고요의 성역',
      clan: '샘플 클랜',
      deck: [
        '호그 라이더',
        '머스킷병',
        '얼음 골렘',
        '대포',
        '파이어 볼',
        '통나무',
        '해골 병사',
        '얼음 정령',
      ].map((name, index) => ({ id: 26000000 + index, name, level: 14, iconUrl: null })),
      verification: 'UNVERIFIED',
      source: 'DEMO',
      fetchedAt: new Date().toISOString(),
    };
  }
}
