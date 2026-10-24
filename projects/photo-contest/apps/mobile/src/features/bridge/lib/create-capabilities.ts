import type { ShareAction, ShareContent, ShareOptions } from 'react-native';

import { BRIDGE_ERROR_CODE, type TPushRegistration } from '@photo-contest/bridge';
import { NativeCapabilityError, type TNativeCapabilities } from '@photo-contest/bridge/native';

import { encodeBase64Url } from '@/shared/lib/base64url';

import {
  buildSocialLoginUrl,
  PKCE_VERIFIER_BYTES,
  readAuthCallback,
  type TSocialProvider,
} from './social-login';

type TImpactStyle = 'light' | 'medium' | 'heavy';
type TNotificationType = 'success' | 'warning' | 'error';

/** 분석에 남길 기능 결과. 어떤 도구로 보낼지는 기능을 쓰는 화면이 정한다. */
export type TCapabilityOutcome =
  | { type: 'share'; status: 'completed' | 'dismissed' }
  | {
      type: 'social-login';
      provider: TSocialProvider;
      status: 'started' | 'succeeded' | 'cancelled' | 'failed';
    };

/** 플랫폼 기능. 앱은 expo 모듈로, 테스트와 E2E는 기록용 가짜로 채운다. */
export interface ICapabilityDependencies {
  getPushRegistration?: (requestPermission: boolean) => Promise<TPushRegistration>;
  setPushBadge?: (count: number) => Promise<{ updated: boolean }>;
  openPushSettings?: () => Promise<{ opened: boolean }>;
  platform: 'ios' | 'android';
  /** 예: https://contest.example/backend */
  apiBase: string;
  /** 검증된 App Link·Universal Link 콜백. 예: https://contest.example/app-auth/callback */
  authCallbackUrl: string;
  share: (content: ShareContent, options: ShareOptions) => Promise<ShareAction>;
  /** 복사에 실패하면 false */
  copyText: (text: string) => Promise<boolean>;
  impact: (style: TImpactStyle) => Promise<void>;
  notify: (type: TNotificationType) => Promise<void>;
  /** expo-web-browser openBrowserAsync. iOS는 사용자가 닫을 때, Android는 연 직후에 끝난다. */
  openBrowser: (url: string) => Promise<{ type: string }>;
  /** expo-web-browser openAuthSessionAsync. redirectUrl은 https 콜백이다(iOS는 Universal Link 콜백으로 연다). */
  openAuthSession: (url: string, redirectUrl: string) => Promise<{ type: string; url?: string }>;
  randomBytes: (count: number) => Uint8Array;
  sha256: (text: string) => Promise<Uint8Array>;
  /** 공유·소셜 로그인 결과. 없으면 기록하지 않는다. */
  onOutcome?: (outcome: TCapabilityOutcome) => void;
}

/** 웹은 link.open을 10초만 기다린다. iOS 브라우저는 닫혀야 끝나므로 열렸는지만 잠깐 보고 답한다. */
const LINK_OPEN_SETTLE_MS = 300;
const LOGIN_FAILED_MESSAGE = '소셜 로그인에 실패했습니다.';

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isCancelled(error: unknown) {
  return error instanceof NativeCapabilityError && error.code === BRIDGE_ERROR_CODE.Cancelled;
}

/** 웹 요청(브리지 기능)을 플랫폼 기능으로 처리한다. 판단만 하고 실제 동작은 주입받는다. */
export function createCapabilities(
  deps: ICapabilityDependencies,
): Required<
  Omit<TNativeCapabilities, 'notifications.registration' | 'notifications.badge' | 'notifications.settings'>
> &
  Pick<TNativeCapabilities, 'notifications.registration' | 'notifications.badge' | 'notifications.settings'> {
  let isLoginInProgress = false;

  function report(outcome: TCapabilityOutcome) {
    try {
      deps.onOutcome?.(outcome);
    } catch {
      // 기록이 실패해도 웹에 보낼 로그인·공유 결과는 그대로 둔다.
    }
  }

  async function runSocialLogin(provider: TSocialProvider) {
    const verifier = encodeBase64Url(deps.randomBytes(PKCE_VERIFIER_BYTES));
    const challenge = encodeBase64Url(await deps.sha256(verifier));
    const callbackUrl = deps.authCallbackUrl;
    const result = await deps
      .openAuthSession(buildSocialLoginUrl(deps.apiBase, provider, challenge), callbackUrl)
      .catch(() => {
        throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Failed, LOGIN_FAILED_MESSAGE);
      });
    if (result.type === 'cancel' || result.type === 'dismiss')
      throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Cancelled, '로그인을 취소했습니다.');
    const callback =
      result.type === 'success' && result.url ? readAuthCallback(result.url, callbackUrl) : null;
    if (callback && 'code' in callback) return { code: callback.code, verifier };
    throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Failed, LOGIN_FAILED_MESSAGE);
  }

  const { getPushRegistration, setPushBadge, openPushSettings } = deps;
  return {
    ...(getPushRegistration
      ? {
          'notifications.registration': async ({ requestPermission }: { requestPermission: boolean }) =>
            getPushRegistration(requestPermission),
        }
      : {}),
    ...(setPushBadge
      ? { 'notifications.badge': async ({ count }: { count: number }) => setPushBadge(count) }
      : {}),
    ...(openPushSettings ? { 'notifications.settings': () => openPushSettings() } : {}),
    'share.open': async ({ url, title, text }) => {
      // iOS 공유 시트는 url을 링크 미리보기로 쓰고, Android는 message 한 칸만 공유한다.
      const content: ShareContent =
        deps.platform === 'ios'
          ? { url, title, message: text }
          : { title, message: text ? `${text}\n${url}` : url };
      const result = await deps.share(content, { dialogTitle: title, subject: title });
      const shared = result.action === 'sharedAction';
      report({ type: 'share', status: shared ? 'completed' : 'dismissed' });
      return { shared };
    },
    'clipboard.copy': async ({ text }) => {
      if (!(await deps.copyText(text)))
        throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Failed, '복사하지 못했습니다.');
      return { copied: true };
    },
    'haptics.impact': async ({ style }) => {
      if (style === 'success' || style === 'warning' || style === 'error') {
        await deps.notify(style);
        return {};
      }
      await deps.impact(style);
      return {};
    },
    'link.open': async ({ url }) => {
      // 실패도 값으로 받아 경쟁에서 진 뒤에 거부돼도 처리되지 않은 거부가 남지 않게 한다.
      const opening = deps.openBrowser(url).then(
        (result) => ({ ok: true as const, type: result.type }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const settled = await Promise.race([opening, wait(LINK_OPEN_SETTLE_MS).then(() => null)]);
      if (settled && !settled.ok) throw settled.error;
      // locked: iOS에서 다른 브라우저가 이미 열려 있다.
      return { opened: settled?.type !== 'locked' };
    },
    'auth.socialLogin': async ({ provider }) => {
      // 두 번 누르면 두 번째는 조용히 무시되도록 CANCELLED로 답한다. 새 시도가 아니라서 기록하지 않는다.
      if (isLoginInProgress)
        throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Cancelled, '이미 로그인을 진행하고 있습니다.');
      isLoginInProgress = true;
      report({ type: 'social-login', provider, status: 'started' });
      try {
        const result = await runSocialLogin(provider);
        report({ type: 'social-login', provider, status: 'succeeded' });
        return result;
      } catch (error) {
        report({ type: 'social-login', provider, status: isCancelled(error) ? 'cancelled' : 'failed' });
        throw error;
      } finally {
        isLoginInProgress = false;
      }
    },
  };
}
