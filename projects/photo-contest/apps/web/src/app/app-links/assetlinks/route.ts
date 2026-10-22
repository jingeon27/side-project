import { appLinksResponse, buildAssetLinks } from '@/shared/lib/app-links.helper';

// next.config rewrites가 /.well-known/assetlinks.json을 이 경로로 보낸다.
// 값은 배포 환경변수이므로 빌드 때 고정하지 않는다.
export const dynamic = 'force-dynamic';

export function GET() {
  return appLinksResponse(process.env, buildAssetLinks);
}
