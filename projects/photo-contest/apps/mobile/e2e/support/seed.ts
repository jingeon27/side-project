import { createHash, randomBytes } from 'node:crypto';

import { createDatabaseClient, createTestImage, devLogin, graphqlRequest } from '@photo-contest/test-kit';
import type { BrowserContext } from '@playwright/test';

import { E2E_API_URL, E2E_WEB_ORIGIN } from './e2e-env';

const SESSION_COOKIE = 'contest_session';

/** 테스트끼리 같은 사용자를 쓰지 않게 닉네임 뒤에 짧은 꼬리를 붙인다. */
export function uniqueNickname(base: string) {
  return `${base}${randomBytes(2).toString('hex')}`;
}

async function gql<TData>(cookie: string, query: string, variables: Record<string, unknown> = {}) {
  const result = await graphqlRequest<TData>(E2E_API_URL, {
    query,
    variables,
    cookie,
    origin: E2E_WEB_ORIGIN,
  });
  if (result.errors?.length || !result.data)
    throw new Error(result.errors?.[0]?.message ?? 'GraphQL 응답이 없습니다.');
  return result.data;
}

/** 개발 로그인으로 사용자를 만들고 세션 Cookie(`contest_session=...`)를 돌려준다. */
export function signUp(nickname: string) {
  return devLogin(E2E_API_URL, { nickname, origin: E2E_WEB_ORIGIN });
}

/** API에서 받은 세션을 웹 origin 쿠키로 넣어 브라우저를 로그인 상태로 만든다. */
export async function signInBrowser(context: BrowserContext, cookie: string) {
  const value = cookie.slice(`${SESSION_COOKIE}=`.length);
  await context.addCookies([
    { name: SESSION_COOKIE, value, url: E2E_WEB_ORIGIN, httpOnly: true, sameSite: 'Lax' },
  ]);
}

export async function seedGroup(ownerCookie: string, name = '웃긴순간 모임') {
  const data = await gql<{ createGroup: { id: string; inviteToken: string } }>(
    ownerCookie,
    'mutation CreateGroup($name: String!) { createGroup(name: $name) { id inviteToken } }',
    { name },
  );
  return data.createGroup;
}

export async function joinGroup(memberCookie: string, inviteToken: string) {
  await gql(memberCookie, 'mutation JoinGroup($token: String!) { joinGroup(token: $token) { id } }', {
    token: inviteToken,
  });
}

/** 지금 제출을 받는 대회 */
export async function seedOpenContest(ownerCookie: string, groupId: string, title = '가을 사진전') {
  const now = Date.now();
  const data = await gql<{ createContest: { id: string } }>(
    ownerCookie,
    `mutation CreateContest($groupId: ID!, $title: String!, $startsAt: DateTime!, $submissionEndsAt: DateTime!, $endsAt: DateTime!) {
      createContest(groupId: $groupId, title: $title, startsAt: $startsAt, submissionEndsAt: $submissionEndsAt, endsAt: $endsAt) { id }
    }`,
    {
      groupId,
      title,
      startsAt: new Date(now).toISOString(),
      submissionEndsAt: new Date(now + 60 * 60_000).toISOString(),
      endsAt: new Date(now + 2 * 60 * 60_000).toISOString(),
    },
  );
  return data.createContest;
}

/** 업로드 티켓으로 실제 이미지를 올리고 제출한다. */
export async function seedSubmission(cookie: string, contestId: string, caption = '고양이가 놀란 순간') {
  const { requestUploadUrl: ticket } = await gql<{ requestUploadUrl: { id: string; url: string } }>(
    cookie,
    'mutation RequestUpload($contestId: ID!) { requestUploadUrl(contestId: $contestId) { id url } }',
    { contestId },
  );
  // 티켓 주소는 웹 프록시 경로(/backend/uploads/...)라 API를 직접 부를 때는 접두사를 뗀다.
  const upload = await fetch(`${E2E_API_URL}${ticket.url.replace(/^\/backend/, '')}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: E2E_WEB_ORIGIN, 'Content-Type': 'image/png' },
    body: new Uint8Array(await createTestImage()),
  });
  if (!upload.ok) throw new Error(`사진 업로드 실패 (${upload.status})`);
  const data = await gql<{ createSubmission: { id: string } }>(
    cookie,
    `mutation CreateSubmission($contestId: ID!, $uploadId: ID!, $caption: String!) {
      createSubmission(contestId: $contestId, uploadId: $uploadId, caption: $caption, rightsConfirmed: true) { id }
    }`,
    { contestId, uploadId: ticket.id, caption },
  );
  return data.createSubmission;
}

/** 방장과 멤버가 있는 그룹, 진행 중인 대회, 멤버가 낸 사진 한 장 */
export async function seedContestWithMemberPhoto() {
  const ownerCookie = await signUp(uniqueNickname('방장'));
  const memberCookie = await signUp(uniqueNickname('멤버'));
  const group = await seedGroup(ownerCookie);
  await joinGroup(memberCookie, group.inviteToken);
  const contest = await seedOpenContest(ownerCookie, group.id);
  const submission = await seedSubmission(memberCookie, contest.id);
  return { ownerCookie, memberCookie, group, contest, submission };
}

/**
 * 소셜 로그인 콜백 대신 앱 로그인 티켓을 직접 만든다. 실제 provider 없이 앱 → 웹 교환(/auth/app/exchange)을 검증한다.
 * challenge는 앱이 인증 세션 주소(app_challenge)에 실은 값이다.
 */
export async function issueAppLoginTicket(challenge: string, nickname = uniqueNickname('구글')) {
  const db = createDatabaseClient(process.env.PC_E2E_DATABASE_URL!);
  try {
    const user = await db.user.create({
      data: { nickname, provider: 'google', providerId: `e2e-${randomBytes(8).toString('hex')}` },
    });
    const code = randomBytes(32).toString('base64url');
    await db.appLoginTicket.create({
      data: {
        codeHash: createHash('sha256').update(code).digest('hex'),
        userId: user.id,
        challenge,
        expiresAt: new Date(Date.now() + 2 * 60_000),
      },
    });
    return { code, nickname };
  } finally {
    await db.$disconnect();
  }
}
