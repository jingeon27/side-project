import { z } from 'zod';

import { ERROR_CODE, fail } from '../common/errors';
import { oauthCredentials, webOrigin } from '../config/env';
import type { TOAuthProviderName } from '../config/env';
import { TEXT_LIMIT } from '../config/limits';

export const OAUTH_PROVIDER = { GOOGLE: 'google', KAKAO: 'kakao' } as const;

const DEFAULT_NICKNAME = '친구';

export interface IOAuthProvider {
  name: TOAuthProviderName;
  clientId: string;
  clientSecret: string | undefined;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  /** provider마다 추가로 보내는 authorize 파라미터 */
  authorizeParams: Record<string, string>;
}

export interface IOAuthIdentity {
  providerId: string;
  nickname: string;
  avatar: string | undefined;
}

const ENDPOINTS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    authorizeParams: { scope: 'openid profile', prompt: 'select_account' },
  },
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    authorizeParams: {},
  },
} as const satisfies Record<
  TOAuthProviderName,
  Omit<IOAuthProvider, 'name' | 'clientId' | 'clientSecret' | 'redirectUri'>
>;

const tokenResponseSchema = z.object({ access_token: z.string().min(1) });
const googleProfileSchema = z.object({
  sub: z.string().min(1),
  name: z.string().optional(),
  picture: z.string().optional(),
});
const kakaoProfileSchema = z.object({
  id: z.union([z.number(), z.string().min(1)]),
  properties: z.object({ nickname: z.string().optional(), profile_image: z.string().optional() }).optional(),
});

export function isOAuthProviderName(value: string): value is TOAuthProviderName {
  return value === OAUTH_PROVIDER.GOOGLE || value === OAUTH_PROVIDER.KAKAO;
}

/** 지원하지 않는 provider는 400, client id가 없으면 503 */
export function oauthProvider(name: string): IOAuthProvider {
  if (!isOAuthProviderName(name)) fail('지원하지 않는 로그인입니다.');
  const { clientId, clientSecret } = oauthCredentials(name);
  if (!clientId) fail('이 소셜 로그인은 아직 설정되지 않았습니다.', ERROR_CODE.UNAVAILABLE);
  const endpoints = ENDPOINTS[name];
  return {
    name,
    clientId,
    clientSecret,
    // 웹과 같은 origin의 /backend 프록시로 돌아와야 state 쿠키가 함께 온다.
    redirectUri: `${webOrigin()}/backend/auth/${name}/callback`,
    authorizeUrl: endpoints.authorizeUrl,
    tokenUrl: endpoints.tokenUrl,
    profileUrl: endpoints.profileUrl,
    authorizeParams: { ...endpoints.authorizeParams },
  };
}

export function accessTokenOf(body: unknown) {
  const parsed = tokenResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.access_token : undefined;
}

function nicknameOf(value: string | undefined) {
  const trimmed = value?.trim();
  return (trimmed ? trimmed : DEFAULT_NICKNAME).slice(0, TEXT_LIMIT.NICKNAME);
}

/** provider 프로필에서 계정 식별자만 꺼낸다. 이메일로 다른 provider 계정을 합치지 않는다. */
export function identityOf(provider: TOAuthProviderName, profile: unknown): IOAuthIdentity | undefined {
  if (provider === OAUTH_PROVIDER.GOOGLE) {
    const parsed = googleProfileSchema.safeParse(profile);
    if (!parsed.success) return undefined;
    return {
      providerId: parsed.data.sub,
      nickname: nicknameOf(parsed.data.name),
      avatar: parsed.data.picture,
    };
  }
  const parsed = kakaoProfileSchema.safeParse(profile);
  if (!parsed.success) return undefined;
  return {
    providerId: String(parsed.data.id),
    nickname: nicknameOf(parsed.data.properties?.nickname),
    avatar: parsed.data.properties?.profile_image,
  };
}
