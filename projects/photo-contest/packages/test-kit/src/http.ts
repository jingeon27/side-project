import dayjs from 'dayjs';

export interface IGraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/** 개발 로그인과 구분해 테스트 전용 API에서 새 사용자·세션을 만든다. */
export async function createTestUser(
  apiUrl: string,
  {
    nickname,
    origin,
    needsOnboarding,
    avatar,
  }: { nickname: string; origin: string; needsOnboarding?: boolean; avatar?: string },
) {
  const response = await fetch(`${apiUrl}/testing/users`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, needsOnboarding, avatar }),
  });
  if (!response.ok) throw new Error(`테스트 사용자 생성 실패 (${response.status})`);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('contest_session='));
  if (!cookie) throw new Error('세션 Cookie가 없습니다.');
  return cookie.split(';')[0] ?? '';
}

export async function moveTestContest(
  apiUrl: string,
  {
    contestId,
    phase,
    origin,
  }: { contestId: string; phase: 'UPCOMING' | 'SUBMISSION' | 'VOTING' | 'COMPLETED'; origin: string },
) {
  const response = await fetch(`${apiUrl}/testing/contests/${encodeURIComponent(contestId)}/phase`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase }),
  });
  if (!response.ok) throw new Error(`테스트 대회 단계 변경 실패 (${response.status})`);
}

interface IGraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
  cookie?: string;
  origin: string;
}

/** 생성이 종료된 구대회는 테스트 전용 API에서만 준비한다. 운영의 생성 mutation을 우회하지 않는다. */
export async function createLegacyTestContest(
  apiUrl: string,
  { groupId, title, origin, cookie }: { groupId: string; title: string; origin: string; cookie?: string },
): Promise<{ id: string }> {
  const now = dayjs().valueOf();
  const response = await fetch(`${apiUrl}/testing/legacy-contests`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({
      groupId,
      title,
      startsAt: dayjs(now).toDate(),
      submissionEndsAt: dayjs(now + 3_600_000).toDate(),
      endsAt: dayjs(now + 7_200_000).toDate(),
    }),
  });
  if (!response.ok) throw new Error(`구대회 fixture 생성 실패 (${response.status})`);
  return response.json() as Promise<{ id: string }>;
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
