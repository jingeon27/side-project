import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { isAuthRequired, sessionOptions } from '@/features/auth';

/** 관리자 세션은 연장 없이 1시간이다. 조회·변경이 401로 끝나면 세션을 다시 받아 라우터가 로그인 화면을 띄우게 한다. */
export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    // 데이터가 있는 주기 조회의 실패는 경계로 던져지지 않으므로 캐시에서 받는다.
    queryCache: new QueryCache({ onError: (error) => void recheckSession(error) }),
    // 호출부가 오류를 보이기 전에 세션 확인을 마친다.
    mutationCache: new MutationCache({ onError: recheckSession }),
    defaultOptions: {
      // 만료로 숨긴 화면은 관찰자가 없어도 데이터를 남겨야 다시 그릴 때 만료된 쿠키로 조회하지 않는다.
      // 로그인·로그아웃의 replaceSession이 세션 외 쿼리를 지우므로 캐시는 한 세션 분량을 넘지 않는다.
      queries: { staleTime: 10_000, retry: 1, gcTime: Infinity },
    },
  });
  async function recheckSession(error: Error) {
    if (isAuthRequired(error)) await client.invalidateQueries(sessionOptions());
  }
  return client;
}
