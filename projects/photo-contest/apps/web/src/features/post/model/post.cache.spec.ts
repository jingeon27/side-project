import { InMemoryCache } from '@apollo/client';
import { describe, expect, it } from 'vitest';

import {
  GalleryPostsDocument,
  PostSort,
  PostKind,
  type GalleryPostsQuery,
  type GalleryPostsQueryVariables,
} from '@/shared/api/generated';

import { resetGalleryPosts } from './post.cache';
import { postTypePolicies } from './post.type-policies';

function post(id: string, groupId: string): GalleryPostsQuery['galleryPosts'][number] {
  return {
    __typename: 'GalleryPost',
    id,
    groupId,
    groupName: groupId,
    title: id,
    body: '',
    kind: PostKind.Photo,
    mediaUrl: '/backend/media/' + id,
    createdAt: '2026-10-15T00:00:00Z',
    likeCount: 0,
    likedByMe: false,
    canDelete: false,
    author: { __typename: 'User', id: 'author', nickname: '친구', avatar: null },
  };
}
const VARIABLES: GalleryPostsQueryVariables = { groupId: null, sort: PostSort.Newest, offset: 0, limit: 2 };
describe('갤러리 게시물 캐시', () => {
  it('전체 최신·각 갤러리·이달 인기의 offset 목록을 섞지 않아야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: postTypePolicies });
    const write = (variables: GalleryPostsQueryVariables, ids: string[]) =>
      cache.writeQuery({
        query: GalleryPostsDocument,
        variables,
        data: { galleryPosts: ids.map((id) => post(id, 'a')) },
      });
    write(VARIABLES, ['new', 'middle']);
    write({ ...VARIABLES, offset: 2 }, ['old']);
    write({ ...VARIABLES, sort: PostSort.MonthlyPopular }, ['old', 'new']);
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: { ...VARIABLES, groupId: 'b' },
      data: { galleryPosts: [post('other', 'b')] },
    });
    const read = (variables: GalleryPostsQueryVariables) =>
      cache.readQuery({ query: GalleryPostsDocument, variables })?.galleryPosts.map((p) => p.id);
    expect(read(VARIABLES)).toEqual(['new', 'middle', 'old']);
    expect(read({ ...VARIABLES, sort: PostSort.MonthlyPopular })).toEqual(['old', 'new']);
    expect(
      cache.readQuery({ query: GalleryPostsDocument, variables: { ...VARIABLES, groupId: 'b' } })
        ?.galleryPosts[0]?.id,
    ).toBe('other');
  });
  it('가입·작성·삭제 뒤 이전 뒷페이지가 새 목록에 되살아나지 않아야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: postTypePolicies });
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: VARIABLES,
      data: { galleryPosts: [post('deleted', 'a')] },
    });
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: { ...VARIABLES, offset: 2 },
      data: { galleryPosts: [post('old', 'a')] },
    });
    resetGalleryPosts(cache);
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: VARIABLES,
      data: { galleryPosts: [post('fresh', 'b')] },
    });
    expect(
      cache.readQuery({ query: GalleryPostsDocument, variables: VARIABLES })?.galleryPosts.map((p) => p.id),
    ).toEqual(['fresh']);
  });
});
