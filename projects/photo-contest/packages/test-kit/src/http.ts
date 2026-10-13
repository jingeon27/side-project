export interface IGraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/** 개발 로그인으로 세션 Cookie(`name=value`)를 받는다. */
export async function devLogin(apiUrl: string, { nickname, origin }: { nickname: string; origin: string }) {
  const response = await fetch(`${apiUrl}/auth/dev`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) throw new Error(`개발 로그인 실패 (${response.status})`);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('contest_session='));
  if (!cookie) throw new Error('세션 Cookie가 없습니다.');
  return cookie.split(';')[0] ?? '';
}

interface IGraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
  cookie?: string;
  origin: string;
}

export async function graphqlRequest<TData>(
  apiUrl: string,
  { query, variables = {}, cookie, origin }: IGraphqlRequest,
): Promise<IGraphqlResponse<TData>> {
  const response = await fetch(`${apiUrl}/graphql`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'Apollo-Require-Preflight': 'true',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as IGraphqlResponse<TData>;
}
