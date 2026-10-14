import { ROUTES } from '@/shared/constants/routes';

/** 카카오톡 등으로 보낼 초대 주소. origin이 없으면(서버 렌더링) 상대 경로를 돌려준다. */
export function buildInviteUrl(origin: string, token: string) {
  return `${origin}${ROUTES.INVITE(token)}`;
}
