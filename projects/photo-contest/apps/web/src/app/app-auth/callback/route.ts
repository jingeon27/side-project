import { appAuthCallbackResponse } from '@/shared/lib/app-auth-callback.server';

// 빌드 때 정적 파일로 만들면 Next가 캐시 헤더를 바꾼다. 매 요청 no-store로 답한다.
export const dynamic = 'force-dynamic';

// 요청(쿼리의 일회용 코드)을 읽지 않고 같은 안내만 돌려준다.
export function GET() {
  return appAuthCallbackResponse();
}
