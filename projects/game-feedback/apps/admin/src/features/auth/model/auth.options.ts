import { queryOptions } from '@tanstack/react-query';

import { fetchSession } from '../api/auth.api';

type TAdminSession = Awaited<ReturnType<typeof fetchSession>>;

/** 관리자로 쓰던 화면에서 세션이 끝났다. 라우터는 화면과 초안을 남긴 채 다시 로그인하게 한다. */
export class AdminSessionExpiredError extends Error {
  constructor() {
    super('로그인 시간이 지났습니다.');
    this.name = 'AdminSessionExpiredError';
  }
}

export function sessionOptions() {
  return queryOptions({
    queryKey: ['admin-session'],
    queryFn: async ({ client, queryKey }) => {
      // 만료를 알린 뒤의 재확인이 연결·서버 오류로 실패해도 다시 로그인할 때까지 만료로 둔다.
      const expired = client.getQueryState(queryKey)?.error instanceof AdminSessionExpiredError;
      const session = await fetchSession().catch((error: unknown) => {
        throw expired ? new AdminSessionExpiredError() : error;
      });
      // 로그인·로그아웃은 setQueryData로 바꾸므로 조회에서 관리자가 사라졌다면 만료다.
      // 오류로 남기면 이전 세션 데이터가 유지되어 라우터가 화면을 내리지 않는다.
      if (
        client.getQueryData<TAdminSession>(queryKey)?.user?.role === 'ADMIN' &&
        session.user?.role !== 'ADMIN'
      )
        throw new AdminSessionExpiredError();
      return session;
    },
    retry: false,
  });
}
