import { randomBytes } from 'node:crypto';

import type { BrowserContext } from '@playwright/test';

import {
  createTestImage,
  createTestUser,
  graphqlRequest,
  uploadTestPostMedia,
} from '@photo-contest/test-kit';

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

/** 테스트 API로 사용자를 만들고 세션 Cookie(`contest_session=...`)를 돌려준다. */
export function signUp(nickname: string) {
  return createTestUser(E2E_API_URL, { nickname, origin: E2E_WEB_ORIGIN });
}

/** API에서 받은 세션을 웹 origin 쿠키로 넣어 브라우저를 로그인 상태로 만든다. */
export async function signInBrowser(context: BrowserContext, cookie: string) {
  const value = cookie.slice(`${SESSION_COOKIE}=`.length);
  await context.addCookies([
    { name: SESSION_COOKIE, value, url: E2E_WEB_ORIGIN, httpOnly: true, sameSite: 'Lax' },
  ]);
}

export async function seedGroup(ownerCookie: string, name = '피식 모임') {
  const data = await gql<{ createGroup: { id: string; inviteToken: string } }>(
    ownerCookie,
    'mutation CreateGroup($name: String!) { createGroup(name: $name) { id inviteToken } }',
    { name },
  );
  return data.createGroup;
}

export async function seedLinkPost(cookie: string, groupId: string) {
  const data = await gql<{ createPost: { id: string } }>(
    cookie,
    'mutation($groupId:ID!){createPost(groupId:$groupId,linkUrl:"https://example.com",title:"모바일 피드 확인용 게시물",body:"화면 확인을 위해 만든 예시 게시물입니다.",rightsConfirmed:true){id}}',
    { groupId },
  );
  return data.createPost;
}

export async function joinGroup(memberCookie: string, inviteToken: string) {
  await gql(memberCookie, 'mutation JoinGroup($token: String!) { joinGroup(token: $token) { id } }', {
    token: inviteToken,
  });
}

/** 기간 없는 그룹과 회원의 게시물을 실제 업로드 API로 만든다. */
export async function seedGalleryWithMemberPost() {
  const ownerCookie = await signUp(uniqueNickname('방장'));
  const memberCookie = await signUp(uniqueNickname('회원'));
  const group = await seedGroup(ownerCookie);
  await joinGroup(memberCookie, group.inviteToken);
  const uploadId = await uploadTestPostMedia(E2E_API_URL, {
    cookie: memberCookie,
    origin: E2E_WEB_ORIGIN,
    groupId: group.id,
    body: await createTestImage(),
    contentType: 'image/png',
  });
  await gql(
    memberCookie,
    'mutation($groupId:ID!,$uploadId:ID!){createPost(groupId:$groupId,uploadId:$uploadId,title:"고양이가 놀란 순간",rightsConfirmed:true){id}}',
    { groupId: group.id, uploadId },
  );
  return { ownerCookie, memberCookie, group };
}
