import { describe, expect, it } from 'vitest';

import { GroupVisibility, PostKind } from '@/shared/api/generated';

import { groupJsonLd, groupMetadata } from './group-seo.helper';
import type { IGroupSeoData } from './group-seo.type';

const origin = 'https://moment.example';
const data: IGroupSeoData = {
  group: {
    __typename: 'Group',
    description: '',
    avatarUrl: null,
    id: 'group-1',
    name: '웃긴 고양이',
    visibility: GroupVisibility.Public,
    categories: [],
    memberCount: 3,
  },
  posts: [
    {
      __typename: 'GalleryPost',
      category: null,
      contestId: null,
      contest: null,
      id: 'post-1',
      groupId: 'group-1',
      groupName: '웃긴 고양이',
      title: '고양이 점프',
      body: '사진에 나온 순간\n전체 본문',
      kind: PostKind.Photo,
      linkUrl: null,
      mediaUrl: '/backend/media/post-1',
      createdAt: '2026-10-19T00:00:00.000Z',
      likeCount: 5,
      commentCount: 2,
      likedByMe: false,
      canDelete: false,
      canModerate: false,
      canInteract: false,
      author: { __typename: 'User', id: 'author-1', nickname: '고양이 친구', avatar: null },
    },
  ],
};

describe('공개 그룹 SEO', () => {
  it('공개 그룹의 소개와 대표 사진을 공유 메타데이터·JSON-LD에 반영해야 한다', () => {
    const profile = {
      ...data,
      group: {
        ...data.group,
        description: '고양이들의 특별한 순간',
        avatarUrl: '/backend/groups/group-1/avatar/avatar-1',
      },
    };
    expect(groupMetadata(profile, origin)).toMatchObject({
      description: profile.group.description,
      openGraph: { images: [`${origin}${profile.group.avatarUrl}`, `${origin}/backend/media/post-1`] },
    });
    expect(groupJsonLd(profile, origin)?.['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'CollectionPage',
          description: profile.group.description,
          image: `${origin}${profile.group.avatarUrl}`,
        }),
      ]),
    );
  });
  it('그룹의 실제 이름·멤버 수·사진으로 canonical과 공유 메타데이터를 만들어야 한다', () => {
    const metadata = groupMetadata(data, origin);
    expect(metadata.title).toBe('웃긴 고양이');
    expect(metadata.description).toContain('3명의 멤버');
    expect(metadata.alternates).toEqual({ canonical: `${origin}/groups/group-1` });
    expect(metadata.openGraph).toMatchObject({ images: [`${origin}/backend/media/post-1`] });
  });

  it('보이는 게시물을 컬렉션·탐색 경로와 연결하고 본문·작성자·실제 좋아요·댓글 수를 담아야 한다', () => {
    const ld = groupJsonLd(data, origin);
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@graph': expect.arrayContaining([
        expect.objectContaining({ '@type': 'WebSite' }),
        expect.objectContaining({ '@type': 'BreadcrumbList' }),
        expect.objectContaining({
          '@type': 'CollectionPage',
          mainEntity: expect.objectContaining({
            '@type': 'ItemList',
            numberOfItems: 1,
            itemListElement: [
              expect.objectContaining({
                item: expect.objectContaining({
                  '@type': 'DiscussionForumPosting',
                  url: `${origin}/groups/group-1#post-post-1`,
                  text: '사진에 나온 순간\n전체 본문',
                  image: `${origin}/backend/media/post-1`,
                  author: { '@type': 'Person', name: '고양이 친구' },
                  commentCount: 2,
                  interactionStatistic: expect.objectContaining({ userInteractionCount: 5 }),
                }),
              }),
            ],
          }),
        }),
      ]),
    });
  });

  it('링크만 있는 게시물은 출처를 표시하고 존재하지 않는 파일을 메타데이터에 만들지 않아야 한다', () => {
    const links = {
      ...data,
      posts: data.posts.map((post) => ({
        ...post,
        kind: PostKind.Link,
        mediaUrl: null,
        linkUrl: 'https://example.com/source',
      })),
    };
    const json = JSON.stringify(groupJsonLd(links, origin));
    expect(json).toContain('"citation":"https://example.com/source"');
    expect(json).not.toContain('associatedMedia');
    expect(json).not.toContain('/backend/media/');
    expect(JSON.stringify(groupMetadata(links, origin))).not.toContain('/backend/media/');
  });
  it('영상에 없는 썸네일을 꾸며 넣지 않고 실제 미디어 주소를 써야 한다', () => {
    const video = { ...data, posts: data.posts.map((post) => ({ ...post, kind: PostKind.Video })) };
    const json = JSON.stringify(groupJsonLd(video, origin));
    expect(json).toContain('MediaObject');
    expect(json).toContain(`${origin}/backend/media/post-1`);
    expect(json).not.toContain('thumbnailUrl');
    expect(json).not.toContain('VideoObject');
  });

  it('비공개 그룹은 관리자가 보던 데이터가 있어도 JSON-LD·그룹 이름·사진을 SEO에 내보내지 않아야 한다', () => {
    const privateData = { ...data, group: { ...data.group, visibility: GroupVisibility.Private } };
    expect(groupJsonLd(privateData, origin)).toBeNull();
    const metadata = groupMetadata(privateData, origin);
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.openGraph).toMatchObject({ images: [] });
    expect(JSON.stringify(metadata)).not.toContain(data.group.name);
    expect(JSON.stringify(metadata)).not.toContain('/backend/media/');
  });
});
