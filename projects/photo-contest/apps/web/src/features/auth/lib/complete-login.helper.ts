import type { IWebBridge } from '@photo-contest/bridge/web';

import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import type { TLoginMethod } from '@/shared/model/analytics';

import { savePendingLogin } from './login-marker.helper';
import { notifySessionChanged } from './session-change-signal';

export function completeLogin(bridge: IWebBridge | null, method: TLoginMethod, nextPath: string) {
  bridge?.notify('auth.changed', { signedIn: true });
  savePendingLogin({ method, next: nextPath });
  notifySessionChanged();
  // 문서를 새로 열어 이전 사용자의 Apollo 캐시를 비운다.
  navigateDocument(nextPath);
}
