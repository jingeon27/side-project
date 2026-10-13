import { nativeApplicationVersion } from 'expo-application';
import Constants from 'expo-constants';

import { pickAppVersion } from '../lib/version.helper';

/** 브리지 앱 정보와 User-Agent는 `x.y.z`만 받아서, 버전을 읽지 못했을 때 대신 알리는 값 */
export const UNKNOWN_APP_VERSION = '0.0.0';

/** 스토어 바이너리 버전을 먼저 쓰고, 개발 클라이언트처럼 없을 때만 app.config 버전을 쓴다. 둘 다 없으면 null. */
export function readAppVersion() {
  return pickAppVersion(nativeApplicationVersion, Constants.expoConfig?.version);
}
