import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { createTestImage, createTestUser, uploadTestPostMedia, graphqlRequest } from '@photo-contest/test-kit';

import {
  ApproveGroupJoinRequestDocument,
  CreateGroupDocument,
  CreatePostDocument,
  GalleryDocument,
  GroupJoinRequestsDocument,
  GroupVisibility,
  MeDocument,
  RequestGroupMembershipDocument,
} from '@/shared/api/generated';

import {
  getGroupSeoData,
  getPublicGroupCount,
  getPublicGroupSitemapPage,
  PUBLIC_GROUP_SITEMAP_SIZE,
} from './group-seo.server';

const origin = 'http://localhost:3321';
let url: string;
let owner: string;
let applicant: string;
let publicId: string;
let privateId: string;

async function execute<TResult, TVariables extends Record<string, unknown>>(
  cookie: string,
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables,
) {
  const result = await graphqlRequest<TResult>(url, { cookie, origin, query: print(document), variables });
  if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

describe('공개 그룹의 SEO·사이트맵 실제 API', () => {
  beforeAll(async () => {
    url = inject('apiUrl');
    owner = await createTestUser(url, { nickname: 'SEO-그룹장', origin });
    applicant = await createTestUser(url, { nickname: 'SEO-신청자', origin });
    publicId = (
      await execute(owner, CreateGroupDocument, { name: 'SEO 공개', visibility: GroupVisibility.Public })
    ).createGroup.id;
    privateId = (
      await execute(owner, CreateGroupDocument, { name: 'SEO 비공개', visibility: GroupVisibility.Private })
    ).createGroup.id;
    for (const groupId of [publicId, privateId]) {
      const uploadId = await uploadTestPostMedia(url, {
        cookie: owner,
        origin,
        groupId,
        body: await createTestImage(),
        contentType: 'image/png',
      });
      await execute(owner, CreatePostDocument, {
        groupId,
        uploadId,
        title: groupId === publicId ? '공개 SEO 사진' : '비공개 비밀 사진',
        rightsConfirmed: true,
      });
    }
  });
  beforeEach(() => {
    vi.stubEnv('API_URL', url);
    vi.stubEnv('WEB_ORIGIN', origin);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('공개 스냅샷에는 실제 게시물만 담고 비공개 그룹은 그룹장이 읽는 요청과 구분해야 한다', async () => {
    const publicData = await getGroupSeoData(publicId);
    expect(publicData?.posts.map((post) => post.title)).toEqual(['공개 SEO 사진']);
    expect(publicData?.posts[0]).toMatchObject({
      canModerate: false,
      canInteract: false,
      canDelete: false,
      likedByMe: false,
    });
    const ownerView = await execute(owner, GalleryDocument, { id: privateId });
    expect(ownerView.group.canViewPosts).toBe(true);
    const privateData = await getGroupSeoData(privateId);
    expect(privateData?.group.visibility).toBe(GroupVisibility.Private);
    expect(privateData?.posts).toEqual([]);
    expect(await getGroupSeoData('missing-seo-group')).toBeNull();
  });

  it('생성 문서로 신청·수락하면 비공개 그룹의 조회자 역할과 접근 가능 상태가 바뀌어야 한다', async () => {
    const requested = (await execute(applicant, RequestGroupMembershipDocument, { groupId: privateId }))
      .requestGroupMembership;
    expect(requested).toMatchObject({ role: null, canViewPosts: false, joinRequestPending: true });
    const userId = (await execute(applicant, MeDocument, {})).me?.id;
    const { groupJoinRequests } = await execute(owner, GroupJoinRequestsDocument, {
      groupId: privateId,
      offset: 0,
      limit: 24,
    });
    const pending = groupJoinRequests.find((request) => request.user.id === userId);
    if (!pending) throw new Error('가입 신청이 있어야 한다');
    await execute(owner, ApproveGroupJoinRequestDocument, { requestId: pending.id });
    expect((await execute(applicant, GalleryDocument, { id: privateId })).group).toMatchObject({
      role: 'MEMBER',
      canViewPosts: true,
      joinRequestPending: false,
    });
    expect((await getGroupSeoData(privateId))?.posts).toEqual([]);
  });

  it('사이트맵을 여러 페이지로 나눠 모든 공개 그룹을 한 번씩 포함하고 비공개는 제외해야 한다', async () => {
    const previousCount = await getPublicGroupCount();
    const ids: string[] = [];
    for (let index = 0; index < PUBLIC_GROUP_SITEMAP_SIZE + 1; index++)
      ids.push((await execute(owner, CreateGroupDocument, { name: `SEO 페이지 ${index}` })).createGroup.id);
    const count = await getPublicGroupCount();
    expect(count).toBe(previousCount + PUBLIC_GROUP_SITEMAP_SIZE + 1);
    const pages = await Promise.all(
      Array.from({ length: Math.ceil(count / PUBLIC_GROUP_SITEMAP_SIZE) }, (_, page) =>
        getPublicGroupSitemapPage(page),
      ),
    );
    const allIds = pages.flat().map((group) => group.id);
    expect(allIds).toHaveLength(count);
    expect(new Set(allIds).size).toBe(count);
    expect(allIds).toEqual(expect.arrayContaining([...ids, publicId]));
    expect(allIds).not.toContain(privateId);
  });

  it('백엔드 연결 실패를 없는 그룹으로 취급하지 않아야 한다', async () => {
    vi.stubEnv('API_URL', 'http://127.0.0.1:1');
    await expect(getGroupSeoData(publicId)).rejects.toThrow();
  });
});
