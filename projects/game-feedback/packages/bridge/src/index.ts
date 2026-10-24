import { z } from 'zod';

import { WebPathSchema } from './routes';

export { appRoutes, resolveAppRoute, RouteIdSchema, WebPathSchema } from './routes';
export type { IAppRoute, TAppScreen, TAppTab } from './routes';

export const BRIDGE_EVENT = 'game-feedback:native';
/** 로그인 밖의 딥링크(`gamefeedback://ko/posts/<id>`)용. 소셜 로그인 코드는 이 스킴으로 받지 않는다. */
export const APP_SCHEME = 'gamefeedback';
/**
 * 앱 소셜 로그인 콜백 경로. 웹 origin의 이 경로만 검증된 App Link·Universal Link로 앱에 연결한다(웹 AASA·assetlinks,
 * 앱 associated domains·intent filter, API `APP_AUTH_CALLBACK_PATH`와 같다). 커스텀 스킴은 로그인 밖 딥링크에만 쓴다.
 */
export const APP_AUTH_CALLBACK_PATH = '/app-auth/callback';
/** 예: https://game.example → https://game.example/app-auth/callback */
export function buildAppAuthCallbackUrl(origin: string) {
  return `${origin}${APP_AUTH_CALLBACK_PATH}`;
}
const id = z.string().min(1).max(100);
const ticket = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const LoginProviderSchema = z.enum(['x', 'kakao', 'discord', 'google']);
export type TLoginProvider = z.infer<typeof LoginProviderSchema>;
export const WebMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('location'), path: WebPathSchema }).strict(),
  z
    .object({ type: z.literal('back-result'), id, handled: z.boolean(), atRoot: z.boolean().optional() })
    .strict(),
  z.object({ type: z.literal('navigation-state'), overlayOpen: z.boolean() }).strict(),
  z.object({ type: z.literal('auth-request'), id, provider: LoginProviderSchema.optional() }).strict(),
]);
export const NativeMessageSchema = z.union([
  z.object({ type: z.literal('open'), path: WebPathSchema }).strict(),
  z.object({ type: z.literal('state'), state: z.enum(['active', 'background']) }).strict(),
  z.object({ type: z.literal('back'), id }).strict(),
  z
    .object({
      type: z.literal('auth-result'),
      id,
      status: z.literal('success'),
      code: ticket,
      verifier: ticket,
    })
    .strict(),
  z.object({ type: z.literal('auth-result'), id, status: z.enum(['cancelled', 'failed']) }).strict(),
]);
export type TWebMessage = z.infer<typeof WebMessageSchema>;
export type TNativeMessage = z.infer<typeof NativeMessageSchema>;
export type TLoginResult =
  { status: 'success'; code: string; verifier: string } | { status: 'cancelled' | 'failed' };
export interface IAppInfo {
  version: string;
  protocol: 1;
}
export function parseWebMessage(data: string): TWebMessage | null {
  try {
    return WebMessageSchema.parse(JSON.parse(data));
  } catch {
    return null;
  }
}
export function parseNativeMessage(data: unknown): TNativeMessage | null {
  const result = NativeMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
export function buildBootstrapScript(version: string) {
  return `window.__GAME_FEEDBACK_APP__=${JSON.stringify({ version, protocol: 1 })};window.dispatchEvent(new Event('game-feedback:bootstrap'));true;`;
}
export function buildDispatchScript(message: TNativeMessage) {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(BRIDGE_EVENT)},{detail:${JSON.stringify(message)}}));true;`;
}

export { GameSlugSchema } from './routes';
