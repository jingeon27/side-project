import { queryOptions } from '@tanstack/react-query';

import type { TLocale } from '@/shared/i18n';

import { synchronizePush } from '../api/push-registration';

/** 기기 알림 권한을 확인하고 허용된 기기를 등록한 결과. 권한을 새로 요청하지 않는다. */
export function pushStatusOptions(userId: string, locale: TLocale) {
  return queryOptions({
    queryKey: ['push-status', userId, locale],
    queryFn: () => synchronizePush(false, locale),
    // 확인할 때마다 기기 등록을 다시 보내므로 화면 복귀마다 반복하지 않는다. 실패하면 기본 안내를 보인다.
    refetchOnWindowFocus: false,
    retry: false,
  });
}
