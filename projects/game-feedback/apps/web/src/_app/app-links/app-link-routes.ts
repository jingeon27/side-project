import { connection } from 'next/server';

import { appLinksResponse, buildAppleAppSiteAssociation, buildAssetLinks } from './app-links';

// 값은 배포 환경변수다. cacheComponents가 빌드 때 응답을 고정하지 않도록 요청 시점에 읽는다.

/** next.config rewrites가 `/.well-known/apple-app-site-association`을 이 라우트로 보낸다. */
export async function appleAppSiteAssociation() {
  await connection();
  return appLinksResponse(process.env, buildAppleAppSiteAssociation);
}

/** next.config rewrites가 `/.well-known/assetlinks.json`을 이 라우트로 보낸다. */
export async function assetLinks() {
  await connection();
  return appLinksResponse(process.env, buildAssetLinks);
}
