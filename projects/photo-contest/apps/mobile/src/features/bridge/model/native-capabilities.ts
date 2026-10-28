import { Platform, Share } from 'react-native';

import { setStringAsync } from 'expo-clipboard';
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType } from 'expo-haptics';
import { openBrowserAsync } from 'expo-web-browser';

import { COLORS } from '@/shared/config/theme';
import { getPushRegistration, openPushSettings, setPushBadge, supportsNativePush } from '@/shared/lib/push';

import {
  createCapabilities,
  type ICapabilityDependencies,
  type TImpactStyle,
  type TNotificationType,
} from '../lib/create-capabilities';

const IMPACT_STYLE = {
  light: ImpactFeedbackStyle.Light,
  medium: ImpactFeedbackStyle.Medium,
  heavy: ImpactFeedbackStyle.Heavy,
} as const satisfies Record<TImpactStyle, ImpactFeedbackStyle>;

const NOTIFICATION_TYPE = {
  success: NotificationFeedbackType.Success,
  warning: NotificationFeedbackType.Warning,
  error: NotificationFeedbackType.Error,
} as const satisfies Record<TNotificationType, NotificationFeedbackType>;

/** expo 모듈로 실제 플랫폼 기능을 만든다. 판단 로직은 createCapabilities가 가진다. */
export function createNativeDependencies(): ICapabilityDependencies {
  return {
    ...(supportsNativePush() ? { getPushRegistration, setPushBadge, openPushSettings } : {}),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    share: (content, options) => Share.share(content, { ...options, tintColor: COLORS.brand }),
    copyText: (text) => setStringAsync(text),
    impact: (style) => impactAsync(IMPACT_STYLE[style]),
    notify: (type) => notificationAsync(NOTIFICATION_TYPE[type]),
    openBrowser: (url) =>
      openBrowserAsync(url, {
        controlsColor: COLORS.brand,
        toolbarColor: COLORS.background,
        dismissButtonStyle: 'close',
      }),
    // iOS는 17.4+ ASWebAuthenticationSession의 https 콜백(.https(host:path:), associated domains 필요)으로 받는다.
    // 옵션이 없으면 이전 callbackURLScheme API로 열려 https 콜백이 돌아오지 않는다.
    // Android는 Custom Tabs를 열고 검증된 App Link로 앱에 돌아온 URL(Linking 'url')을 받는다.
  };
}

/** 앱이 웹에 제공하는 브리지 기능 전체. onOutcome으로 공유·소셜 로그인 결과를 받는다. */
export function createNativeCapabilities(
  onOutcome?: ICapabilityDependencies['onOutcome'],
): ReturnType<typeof createCapabilities> {
  return createCapabilities({ ...createNativeDependencies(), onOutcome });
}
