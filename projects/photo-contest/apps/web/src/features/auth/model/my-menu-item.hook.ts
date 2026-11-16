'use client';

import { usePathname } from 'next/navigation';

import { useQuery } from '@apollo/client/react';

import { MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { buildLoginRedirectPath } from '@/shared/lib/login-redirect.helper';
import { ANALYTICS_EVENT, toPathTemplate, trackEvent } from '@/shared/model/analytics';
import { useIsSSR } from '@/shared/model/is-ssr.hook';

/** 주요 메뉴의 MY 항목. 세션이 없으면 이름과 목적지를 인증 화면으로 바꾼다. */
export function useMyMenuItem(placement: 'bottom_nav' | 'desktop_nav') {
  const pathname = usePathname();
  const isSSR = useIsSSR();
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  // 세션 없음이 확인되기 전에는 MY로 둔다. /me도 같은 로그인 안내를 보여 준다.
  if (isSSR || viewer?.me !== null) return { href: ROUTES.ME, label: 'MY' };
  return {
    href: buildLoginRedirectPath(ROUTES.ME),
    label: '로그인',
    onClick: () =>
      trackEvent(ANALYTICS_EVENT.SignEntryClicked, {
        placement,
        source_path_template: toPathTemplate(pathname),
        destination_path_template: ROUTES.ME,
      }),
  };
}
