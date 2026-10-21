import { InMemoryCache } from '@apollo/client';
import { describe, expect, it } from 'vitest';

import {
  GalleryPostsDocument,
  PostCommentsDocument,
  PostKind,
  PostSort,
  type GalleryPostsQuery,
  type GalleryPostsQueryVariables,
} from '@/shared/api/generated';

import { resetGalleryPosts } from './post.cache';
import { postTypePolicies } from './post.type-policies';

function post(id: string, groupId: string): GalleryPostsQuery['galleryPosts'][number] {
  return {
    __typename: 'GalleryPost',
    category: null,
    contestId: null,
    contest: null,
    id,
    groupId,
    groupName: groupId,
    title: id,
    body: '',
    kind: PostKind.Photo,
    linkUrl: null,
    mediaUrl: '/backend/media/' + id,
    createdAt: '2026-10-15T00:00:00Z',
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: true,
    author: { __typename: 'User', id: 'author', nickname: '친구', avatar: null },
  };
}
const VARIABLES: GalleryPostsQueryVariables = { groupId: null, sort: PostSort.Newest, offset: 0, limit: 2 };
describe('그룹 게시물 캐시', () => {
  it('같은 그룹의 카테고리별 offset 목록을 섞지 않아야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: postTypePolicies });
    for (const [categoryId, ids] of [
      ['category-a', ['a', 'b']],
      ['category-b', ['c']],
    ] as const)
      cache.writeQuery({
        query: GalleryPostsDocument,
        variables: { ...VARIABLES, groupId: 'group', categoryId },
        data: { galleryPosts: ids.map((id) => post(id, 'group')) },
      });
    const read = (categoryId: string) =>
      cache
        .readQuery({ query: GalleryPostsDocument, variables: { ...VARIABLES, groupId: 'group', categoryId } })
        ?.galleryPosts.map(({ id }) => id);
    expect(read('category-a')).toEqual(['a', 'b']);
    expect(read('category-b')).toEqual(['c']);
  });
  it('댓글 페이지를 게시물별로 나누고 첫 페이지 갱신은 이전 뒷페이지를 대체해야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: postTypePolicies });
    const write = (postId: string, offset: number, id: string, overwrite = false, parentId?: string) =>
      cache.writeQuery({
        overwrite,
        query: PostCommentsDocument,
        variables: { postId, parentId: parentId ?? null, offset, limit: 1 },
        data: {
          postCommentCount: 2,
          postComments: [
            {
              __typename: 'PostComment',
              parentId: parentId ?? null,
              replyCount: 0,
              likeCount: 0,
              likedByMe: false,
              canInteract: true,
              id,
              postId,
              body: id,
              createdAt: '2026-10-17T00:00:00Z',
              canDelete: true,
              author: { __typename: 'User', id: 'author', nickname: '친구', avatar: null },
            },
          ],
        },
      });
    const read = (postId: string, parentId?: string) =>
      cache
        .readQuery({
          query: PostCommentsDocument,
          variables: { postId, parentId: parentId ?? null, offset: 0, limit: 1 },
        })
        ?.postComments.map(({ id }) => id);
    write('a', 0, 'a-new');
    write('a', 1, 'a-old');
    write('b', 0, 'b-new');
    expect(read('a')).toEqual(['a-new', 'a-old']);
    expect(read('b')).toEqual(['b-new']);
    write('a', 0, 'a-fresh', true);
    expect(read('a')).toEqual(['a-fresh']);
    expect(read('b')).toEqual(['b-new']);
    write('a', 0, 'a-reply', false, 'a-fresh');
    write('a', 0, 'other-reply', false, 'another-thread');
    expect(read('a', 'a-fresh')).toEqual(['a-reply']);
    expect(read('a', 'another-thread')).toEqual(['other-reply']);
    expect(read('a')).toEqual(['a-fresh']);
  });
  it('전체 최신·각 그룹·이달 인기의 offset 목록을 섞지 않아야 한다', () => {
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
  it('그룹 피드와 각 대회 참여작의 offset 목록을 분리해야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: postTypePolicies });
    const write = (contestId: string | undefined, offset: number, id: string) =>
      cache.writeQuery({
        query: GalleryPostsDocument,
        variables: { ...VARIABLES, groupId: 'a', contestId, offset },
        data: { galleryPosts: [post(id, 'a')] },
      });
    write(undefined, 0, 'general');
    write('first', 0, 'first-new');
    write('first', 1, 'first-old');
    write('second', 0, 'second-new');
    const read = (contestId?: string) =>
      cache
        .readQuery({ query: GalleryPostsDocument, variables: { ...VARIABLES, groupId: 'a', contestId } })
        ?.galleryPosts.map(({ id }) => id);
    expect(read()).toEqual(['general']);
    expect(read('first')).toEqual(['first-new', 'first-old']);
    expect(read('second')).toEqual(['second-new']);
  });
});
