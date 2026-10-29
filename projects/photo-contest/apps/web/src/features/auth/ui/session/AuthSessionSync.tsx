'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { useQuery } from '@apollo/client/react';

import { MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import {
  buildLoginRedirectPath,
  getSafeNextPath,
  isSessionRequiredPath,
} from '@/shared/lib/auth-gate.helper';
import { ANALYTICS_EVENT, forgetAnalyticsUser, identifyUser, trackEvent } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';
import { useAppRouter } from '@/shared/model/router';

import { readNotifiedUserId, saveNotifiedUserId, takePendingLogin } from '../../lib/login-marker.helper';

/**
 * 레이아웃에 한 번 둔다(화면은 그리지 않는다). 누가 로그인했는지 확인되면 분석 도구와 앱에 같은 사용자 ID를 알린다.
 * - 직전 문서가 남긴 로그인 표시가 있으면 login_succeeded를 보내고, OAuth가 홈으로 돌려보냈다면 가려던 경로로 옮긴다.
 * - 앱에는 이 탭에서 처음 확인한 사용자만 auth.changed로 알린다(앱이 다시 열려도 같은 사용자로 묶이게).
 * - 비로그인으로 확인되면 앱에 signedIn:false를 알리고 남은 분석 사용자를 지운다. 세션 만료는 대개 앱을 다시 연 뒤에
 *   드러나 이 탭의 표시로는 알 수 없고, 앱·분석 도구 모두 식별된 사용자가 있을 때만 초기화하므로 익명 방문의 기기 ID는 그대로다.
 */
export function AuthSessionSync() {
  const bridge = useBridge();
  const router = useAppRouter();
  const pathname = usePathname();
  const { data } = useQuery(MeDocument);
  const me = data?.me;

  useEffect(() => {
    if (me === undefined) return;
    const pending = takePendingLogin();
    if (!me) {
      forgetAnalyticsUser();
      saveNotifiedUserId(null);
      bridge?.notify('auth.changed', { signedIn: false });
      if (isSessionRequiredPath(pathname))
        router.replace(buildLoginRedirectPath(`${pathname}${window.location.search}`));
      return;
    }
    identifyUser(me.id);
    if (readNotifiedUserId() !== me.id) {
      bridge?.notify('auth.changed', { signedIn: true, userId: me.id });
      saveNotifiedUserId(me.id);
    }
    if (me.needsOnboarding && window.location.pathname !== ROUTES.ONBOARDING) {
      const destination = getSafeNextPath(
        pending?.next ?? new URLSearchParams(window.location.search).get('next'),
      );
      router.replace(`${ROUTES.ONBOARDING}?next=${encodeURIComponent(destination)}`);
      return;
    }
    if (!pending) return;
    trackEvent(ANALYTICS_EVENT.LoginSucceeded, { provider: pending.method });
    const next = getSafeNextPath(pending.next);
    if (window.location.pathname === ROUTES.HOME && next !== ROUTES.HOME) router.replace(next);
  }, [me, bridge, router, pathname]);

  return null;
}
