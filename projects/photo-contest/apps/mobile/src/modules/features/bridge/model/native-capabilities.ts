import type { TNativeCapabilities } from '@photo-contest/bridge/native';
import { setStringAsync } from 'expo-clipboard';
import { CryptoDigestAlgorithm, digest, getRandomValues } from 'expo-crypto';
import { ImpactFeedbackStyle, NotificationFeedbackType, impactAsync, notificationAsync } from 'expo-haptics';
import { openAuthSessionAsync, openBrowserAsync } from 'expo-web-browser';
import { Platform, Share } from 'react-native';

import { API_BASE, APP_SCHEME } from '@/modules/shared/config/env';
import { COLORS } from '@/modules/shared/config/theme';

import { createCapabilities } from '../lib/create-capabilities';
import type { ICapabilityDependencies } from '../lib/create-capabilities';

const IMPACT_STYLE = {
  light: ImpactFeedbackStyle.Light,
  medium: ImpactFeedbackStyle.Medium,
  heavy: ImpactFeedbackStyle.Heavy,
} as const;

const NOTIFICATION_TYPE = {
  success: NotificationFeedbackType.Success,
  warning: NotificationFeedbackType.Warning,
  error: NotificationFeedbackType.Error,
} as const;

/** expo 모듈로 실제 플랫폼 기능을 만든다. 판단 로직은 createCapabilities가 가진다. */
export function createNativeDependencies(): ICapabilityDependencies {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    apiBase: API_BASE,
    appScheme: APP_SCHEME,
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
    openAuthSession: (url, redirectUrl) => openAuthSessionAsync(url, redirectUrl),
    // getRandomBytes는 개발 중 원격 디버깅이면 Math.random으로 바뀐다. PKCE verifier는 항상 네이티브 난수를 쓴다.
    randomBytes: (count) => getRandomValues(new Uint8Array(count)),
    sha256: async (text) =>
      new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(text))),
  };
}

/** 앱이 웹에 제공하는 브리지 기능 전체 */
export function createNativeCapabilities(): Required<TNativeCapabilities> {
  return createCapabilities(createNativeDependencies());
}
