import type { TPushRegistration } from '@photo-contest/bridge';

/** 앱이 알려 준 권한 상태. 서버가 발송을 켜지 않았으면 granted여도 unavailable로 바꾼다. */
export type TPushStatus = TPushRegistration['status'];
