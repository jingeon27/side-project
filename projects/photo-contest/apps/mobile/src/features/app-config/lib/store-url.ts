const STORE_URL = /^(?:https:\/\/|itms-apps:\/\/|market:\/\/)[^\s]+$/i;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

interface IStoreUrlOptions {
  platform: 'ios' | 'android';
  /** 빌드마다 넣는 EXPO_PUBLIC_STORE_URL. 비어 있을 수 있다. */
  configuredUrl: string | null | undefined;
  /** expo-application applicationId */
  androidPackage: string | null | undefined;
}

/**
 * 업데이트 화면의 스토어 링크. 설정값을 먼저 쓰고, 없으면 Android만 패키지 이름으로 만든다.
 * iOS는 App Store 숫자 ID가 있어야 해서 설정이 없으면 null(버튼 숨김)이다.
 */
export function resolveStoreUrl({ platform, configuredUrl, androidPackage }: IStoreUrlOptions) {
  const configured = configuredUrl?.trim();
  if (configured && STORE_URL.test(configured)) return configured;
  if (platform === 'android' && androidPackage && ANDROID_PACKAGE.test(androidPackage))
    return `market://details?id=${androidPackage}`;
  return null;
}
