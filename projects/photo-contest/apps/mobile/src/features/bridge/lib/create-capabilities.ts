import type { Share, ShareContent, ShareOptions } from 'react-native';

import { BRIDGE_ERROR_CODE, type TPushRegistration } from '@photo-contest/bridge';
import { NativeCapabilityError, type TNativeCapabilities } from '@photo-contest/bridge/native';

export type TImpactStyle = 'light' | 'medium' | 'heavy';
export type TNotificationType = 'success' | 'warning' | 'error';

/** 분석에 남길 기능 결과. 어떤 도구로 보낼지는 기능을 쓰는 화면이 정한다. */
export type TCapabilityOutcome = { type: 'share'; status: 'completed' | 'dismissed' };

/** 플랫폼 기능. 앱은 expo 모듈로, 테스트와 E2E는 기록용 가짜로 채운다. */
export interface ICapabilityDependencies {
  getPushRegistration?: (requestPermission: boolean) => Promise<TPushRegistration>;
  setPushBadge?: (count: number) => Promise<{ updated: boolean }>;
  openPushSettings?: () => Promise<{ opened: boolean }>;
  platform: 'ios' | 'android';
  share: (
    content: ShareContent,
    options: ShareOptions,
  ) => Promise<Pick<Awaited<ReturnType<typeof Share.share>>, 'action'>>;
  /** 복사에 실패하면 false */
  copyText: (text: string) => Promise<boolean>;
  impact: (style: TImpactStyle) => Promise<void>;
  notify: (type: TNotificationType) => Promise<void>;
  /** expo-web-browser openBrowserAsync. iOS는 사용자가 닫을 때, Android는 연 직후에 끝난다. */
  openBrowser: (url: string) => Promise<{ type: string }>;
  /** 공유 결과. 없으면 기록하지 않는다. */
  onOutcome?: (outcome: TCapabilityOutcome) => void;
}

/** 웹은 link.open을 10초만 기다린다. iOS 브라우저는 닫혀야 끝나므로 열렸는지만 잠깐 보고 답한다. */
const LINK_OPEN_SETTLE_MS = 300;

function wait(ms: number) {
  return new Promise<null>((resolve) => setTimeout(resolve, ms, null));
}

/** 웹 요청(브리지 기능)을 플랫폼 기능으로 처리한다. 판단만 하고 실제 동작은 주입받는다. */
export function createCapabilities(
  deps: ICapabilityDependencies,
): Required<
  Omit<TNativeCapabilities, 'notifications.registration' | 'notifications.badge' | 'notifications.settings'>
> &
  Pick<TNativeCapabilities, 'notifications.registration' | 'notifications.badge' | 'notifications.settings'> {
  function report(outcome: TCapabilityOutcome) {
    try {
      deps.onOutcome?.(outcome);
    } catch {
      // 기록이 실패해도 웹에 보낼 공유 결과는 그대로 둔다.
    }
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
      const open = async () => {
        try {
          const result = await deps.openBrowser(url);
          return { ok: true as const, type: result.type };
        } catch (error) {
          return { ok: false as const, error };
        }
      };
      const settled = await Promise.race([open(), wait(LINK_OPEN_SETTLE_MS)]);
      if (settled && !settled.ok) throw settled.error;
      // locked: iOS에서 다른 브라우저가 이미 열려 있다.
      return { opened: settled?.type !== 'locked' };
    },
  };
}
