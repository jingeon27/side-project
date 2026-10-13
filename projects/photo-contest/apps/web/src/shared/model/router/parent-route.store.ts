import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { ROUTES } from '../../constants/routes';

let registered: { pathname: string; href: string } | null = null;

/** 화면이 알려 준 상위 화면. 알려 주지 않았으면 홈, 홈이면 null. */
export function getParentRoute(pathname: string) {
  if (registered?.pathname === pathname) return registered.href;
  return pathname === ROUTES.HOME ? null : ROUTES.HOME;
}

export function registerParentRoute(pathname: string, href: string) {
  const entry = { pathname, href };
  registered = entry;
  return () => {
    if (registered === entry) registered = null;
  };
}

/** 지금 화면의 상위 화면(대회→그룹 등)을 등록한다. 앱 뒤로 가기에서 기록이 없을 때 이곳으로 간다. */
export function useParentRoute(href: string) {
  const pathname = usePathname();
  useEffect(() => registerParentRoute(pathname, href), [pathname, href]);
}
