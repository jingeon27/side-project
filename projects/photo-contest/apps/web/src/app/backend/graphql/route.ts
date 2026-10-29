import { proxyGraphql } from '@/shared/api/graphql-proxy.server';

export async function POST(request: Request) {
  return proxyGraphql(request);
}

export async function GET(request: Request) {
  return proxyGraphql(request);
}
