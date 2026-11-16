import qs from 'qs';

const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
/** app.config.ts가 빌드 때 MOBILE_IOS_APP_STORE_ID를 검사하는 형식과 같게 둔다. */
const APP_STORE_ID = /^[1-9][0-9]{5,14}$/;

interface IStoreUrlOptions {
  platform: 'ios' | 'android';
  /** expo-application applicationId */
  androidPackage: string | null | undefined;
  /** 루트 .env MOBILE_IOS_APP_STORE_ID로 받은 App Store 숫자 앱 ID */
  iosAppStoreId: string | null;
}

/**
 * 업데이트 화면의 스토어 링크. Android는 패키지 이름으로, iOS는 설정한 App Store 숫자 ID로 만든다.
 * 만들 수 없으면 null(버튼 숨김)이다. iOS ID는 추측하지 않는다.
 */
export function resolveStoreUrl({ platform, androidPackage, iosAppStoreId }: IStoreUrlOptions) {
  if (platform === 'ios')
    return iosAppStoreId && APP_STORE_ID.test(iosAppStoreId)
      ? `https://apps.apple.com/app/id${iosAppStoreId}`
      : null;
  if (androidPackage && ANDROID_PACKAGE.test(androidPackage))
    return `market://details${qs.stringify({ id: androidPackage }, { addQueryPrefix: true })}`;
  return null;
}
