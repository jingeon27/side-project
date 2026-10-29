import 'server-only';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';

import { publicCacheOptions } from './public-cache.policy';
import { buildServerRequestHeaders, getServerApiUrl, getWebOrigin } from './server-request.helper';

export class PublicQueryError extends Error {
  constructor(readonly code: string | undefined) {
    super('공개 정보를 불러오지 못했습니다.');
  }
}

/** SEO·사이트맵에는 로그인한 사용자의 비공개 데이터가 섞이지 않도록 쿠키를 전달하지 않는다. */
export async function publicQuery<TResult, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables,
  cacheSeconds?: number,
): Promise<TResult> {
  const response = await fetch(`${getServerApiUrl()}/graphql`, {
    method: 'POST',
    ...(cacheSeconds ? publicCacheOptions(document, cacheSeconds) : { cache: 'no-store' as const }),
    credentials: 'omit',
    signal: AbortSignal.timeout(10_000),
    headers: buildServerRequestHeaders(
      {
        'Content-Type': 'application/json',
        ...(cacheSeconds ? { 'x-photo-contest-public-query': 'true' } : {}),
      },
      { cookie: null, webOrigin: getWebOrigin() },
    ),
    body: JSON.stringify({ query: print(document), variables }),
  });
  if (!response.ok) throw new PublicQueryError(undefined);
  const result = (await response.json()) as {
    data?: TResult;
    errors?: Array<{ extensions?: { code?: string } }>;
  };
  if (result.errors?.length || !result.data) throw new PublicQueryError(result.errors?.[0]?.extensions?.code);
  return result.data;
}
