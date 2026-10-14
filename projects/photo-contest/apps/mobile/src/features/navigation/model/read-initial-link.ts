import { getInitialURL } from 'expo-linking';

import { toWebPath } from '../lib/deep-link';
import { LINK_OPTIONS } from './link-options';

const HOME_PATH = '/';

export interface IInitialLink {
  /** 처음 열 웹 경로. 링크가 없거나 모르는 링크면 홈 */
  path: string;
  /** 앱이 아는 링크(앱 스킴·유니버설 링크)로 열렸는지 */
  isDeepLink: boolean;
}

/** 앱을 연 링크를 첫 웹 경로로 바꾼다. 링크를 읽지 못해도 홈으로 열도록 거부하지 않는다. */
export async function readInitialLink(): Promise<IInitialLink> {
  const url = await getInitialURL().catch(() => null);
  const path = url ? toWebPath(url, LINK_OPTIONS) : null;
  return path ? { path, isDeepLink: true } : { path: HOME_PATH, isDeepLink: false };
}
