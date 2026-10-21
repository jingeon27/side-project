import { APP_CALLBACK, type TLoginProvider, type TLoginResult } from '@game-feedback/bridge';

export function parseLoginCallback(url: string, verifier: string): TLoginResult {
  const match = /^gamefeedback:\/\/auth\/callback\?code=([A-Za-z0-9_-]{43})$/.exec(url);
  if (!match?.[1]) return { status: 'failed' };
  return { status: 'success', code: match[1], verifier };
}
interface ILoginPlatform {
  randomVerifier: () => string;
  challenge: (verifier: string) => Promise<string>;
  openSession: (url: string, callback: string) => Promise<{ type: string; url?: string }>;
}
export async function socialLogin(
  origin: string,
  platform: ILoginPlatform,
  provider: TLoginProvider = 'google',
): Promise<TLoginResult> {
  const verifier = platform.randomVerifier();
  const challenge = await platform.challenge(verifier);
  const result = await platform.openSession(
    `${origin}/api/auth/social/${provider}?app_challenge=${challenge}`,
    APP_CALLBACK,
  );
  if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
  if (result.type !== 'success' || !result.url) return { status: 'failed' };
  return parseLoginCallback(result.url, verifier);
}
