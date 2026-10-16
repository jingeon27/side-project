import { z } from 'zod';

export const BRIDGE_EVENT = 'game-feedback:native';
export const APP_SCHEME = 'gamefeedback';
export const APP_CALLBACK = `${APP_SCHEME}://auth/callback`;
const id = z.string().min(1).max(100);
export const WebPathSchema = z
  .string()
  .max(512)
  .regex(
    /^\/(ko|en|ja)(\/(messages|settings|notifications|guide|terms|privacy|contact)|\/posts\/[A-Za-z0-9_-]{1,128})?\/?(\?conversation=[A-Za-z0-9_-]{1,128})?$/,
  );
const ticket = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const WebMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('location'), path: WebPathSchema }).strict(),
  z.object({ type: z.literal('back-result'), id, handled: z.boolean() }).strict(),
  z.object({ type: z.literal('auth-request'), id }).strict(),
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
