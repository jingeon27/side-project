import 'server-only';

import { revalidateTag } from 'next/cache';

import { graphqlMutation, mutationChangedData } from './graphql-mutation.helper';
import { GRAPHQL_PROXY_BODY_LIMIT, GRAPHQL_PROXY_TIMEOUT_MS, PUBLIC_CACHE_TAG } from './public-cache.policy';
import { getServerApiUrl } from './server-request.helper';

const HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function proxyHeaders(source: Headers, response = false) {
  const headers = new Headers(source);
  for (const name of HOP_HEADERS) headers.delete(name);
  headers.delete('host');
  if (response) {
    headers.delete('content-length');
    headers.delete('content-encoding');
  }
  return headers;
}

export async function proxyGraphql(request: Request) {
  const headers = proxyHeaders(request.headers);
  const json =
    request.method === 'POST' &&
    headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/json';
  const text = json ? await readJsonBody(request) : null;
  if (text === false)
    return Response.json({ errors: [{ message: '요청 본문이 너무 큽니다.' }] }, { status: 413 });
  if (json) headers.delete('content-length');
  const mutation = text ? readMutation(text) : null;
  const url = new URL(`${getServerApiUrl()}/graphql`);
  url.search = new URL(request.url).search;
  const options: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(GRAPHQL_PROXY_TIMEOUT_MS)]),
    ...(request.method === 'POST' ? { body: text ?? request.body, duplex: 'half' } : {}),
  };
  const response = await fetch(url, options);
  if (mutation && response.ok) {
    const result: unknown = await response.clone().json();
    if (mutationChangedData(mutation, result)) revalidateTag(PUBLIC_CACHE_TAG, { expire: 0 });
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders(response.headers, true),
  });
}

async function readJsonBody(request: Request): Promise<string | false> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > GRAPHQL_PROXY_BODY_LIMIT) {
      await reader.cancel();
      return false;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function readMutation(body: string) {
  try {
    return graphqlMutation(JSON.parse(body));
  } catch {
    return null;
  }
}
