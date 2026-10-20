import { getOperationAST, OperationTypeNode, type DocumentNode } from 'graphql';

export const PUBLIC_CACHE_TAG = 'photo-contest:public:v1';
export const PUBLIC_CONTENT_TTL = 30;
export const PUBLIC_SITEMAP_TTL = 60;
export const GRAPHQL_PROXY_BODY_LIMIT = 64 * 1024;
export const GRAPHQL_PROXY_TIMEOUT_MS = 120_000;
export const PUBLIC_QUERY_HEADER = 'x-photo-contest-public-query';

export function publicPreloadContext(document: DocumentNode) {
  return {
    headers: { [PUBLIC_QUERY_HEADER]: 'true' },
    fetchOptions: publicCacheOptions(document, PUBLIC_CONTENT_TTL),
  };
}

export function publicCacheOptions(document: DocumentNode, seconds: number) {
  if (getOperationAST(document)?.operation !== OperationTypeNode.QUERY)
    throw new Error('공개 데이터 캐시는 query 문서에만 사용할 수 있습니다.');
  return { cache: 'force-cache' as const, next: { revalidate: seconds, tags: [PUBLIC_CACHE_TAG] } };
}
