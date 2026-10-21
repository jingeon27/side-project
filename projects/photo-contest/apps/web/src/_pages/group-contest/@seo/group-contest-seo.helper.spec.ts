import { describe, expect, it } from 'vitest';

import { GroupVisibility, Phase, PostKind } from '@/shared/api/generated';
import { serializeJsonLd } from '@/shared/lib/seo.helper';

import {
  groupContestJsonLd,
  groupContestMetadata,
  type IGroupContestSeoData,
} from './group-contest-seo.helper';

const origin = 'https://moments.example';
const data: IGroupContestSeoData = {
  group: {
    __typename: 'Group',
    id: 'group',
    name: '공개 그룹',
    visibility: GroupVisibility.Public,
    categories: [],
    memberCount: 3,
  },
  contest: {
    __typename: 'GroupContest',
    id: 'contest',
    groupId: 'group',
    title: '웃음 </script><script>alert(1)</script>',
    startsAt: '2026-10-20T00:00:00Z',
    submissionEndsAt: '2026-10-21T00:00:00Z',
    endsAt: '2026-10-22T00:00:00Z',
    phase: Phase.Submission,
    entryCount: 1,
    winners: [],
  },
  posts: [
    {
      __typename: 'GalleryPost',
      category: null,
      id: 'photo',
      contestId: 'contest',
      contest: {
        __typename: 'PostContest',
        id: 'contest',
        groupId: 'group',
        title: '웃음',
        phase: Phase.Submission,
      },
      groupId: 'group',
      groupName: '공개 그룹',
      title: '참여 사진',
      body: '순간 포착',
      kind: PostKind.Photo,
      linkUrl: null,
      mediaUrl: '/backend/media/photo',
      createdAt: '2026-10-20T00:00:00Z',
      likeCount: 2,
      commentCount: 0,
      likedByMe: false,
      canDelete: false,
      canModerate: false,
      canInteract: false,
      author: { __typename: 'User', id: 'author', nickname: '참여자', avatar: null },
    },
  ],
};

describe('대회 상세 SEO', () => {
  it('공개 대회의 canonical·공유 사진·실제 일정과 참여작을 연결해야 한다', () => {
    const metadata = groupContestMetadata(data, 'contest', origin);
    expect(metadata.alternates?.canonical).toBe(`${origin}/groups/group/contests/contest`);
    expect(metadata.openGraph).toMatchObject({ images: [`${origin}/backend/media/photo`] });
    const ld = groupContestJsonLd(data, origin);
    expect(ld?.['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'Event',
          startDate: data.contest?.startsAt,
          endDate: data.contest?.endsAt,
          location: { '@type': 'VirtualLocation', url: `${origin}/groups/group/contests/contest` },
        }),
        expect.objectContaining({
          '@type': 'CollectionPage',
          mainEntity: expect.objectContaining({ numberOfItems: 1 }),
        }),
      ]),
    );
    expect(serializeJsonLd(ld ?? {})).not.toContain('</script>');
  });
  it('비공개 그룹은 조회자와 데이터가 있어도 대회 제목·이미지·구조화 데이터를 공개하지 않아야 한다', () => {
    const privateData = { ...data, group: { ...data.group, visibility: GroupVisibility.Private } };
    const metadata = groupContestMetadata(privateData, 'contest', origin);
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.openGraph).toMatchObject({ images: [] });
    expect(JSON.stringify(metadata)).not.toContain(data.contest?.title);
    expect(groupContestJsonLd(privateData, origin)).toBeNull();
  });
  it('영상의 썸네일·별점·없는 수상을 만들어 내지 않아야 한다', () => {
    const video = { ...data, posts: data.posts.map((post) => ({ ...post, kind: PostKind.Video })) };
    const ld = JSON.stringify(groupContestJsonLd(video, origin));
    expect(ld).toContain('MediaObject');
    for (const field of ['thumbnailUrl', 'aggregateRating', 'award']) expect(ld).not.toContain(field);
    expect(groupContestMetadata(video, 'contest', origin).openGraph).toMatchObject({
      images: [`${origin}/opengraph-image`],
    });
  });
});
