import { describe, expect, it } from 'vitest';

import { GroupVisibility, Phase } from '@/shared/api/generated';

import {
  groupContestsJsonLd,
  groupContestsMetadata,
  type IGroupContestsSeoData,
} from './group-contests-seo.helper';

const origin = 'https://moments.example';
const data: IGroupContestsSeoData = {
  group: {
    __typename: 'Group',
    description: '',
    avatarUrl: null,
    id: 'group',
    name: '웃음 그룹',
    visibility: GroupVisibility.Public,
    categories: [],
    memberCount: 2,
  },
  contests: [
    {
      __typename: 'GroupContest',
      likeLimit: 1,
      id: 'contest',
      groupId: 'group',
      title: '지난 대회',
      startsAt: '2026-10-01T00:00:00Z',
      submissionEndsAt: '2026-10-02T00:00:00Z',
      endsAt: '2026-10-03T00:00:00Z',
      phase: Phase.Completed,
      isAdmin: false,
      canParticipate: false,
      canVote: false,
      votedPostId: null,
      entryCount: 0,
      winners: [],
    },
  ],
};

describe('그룹 대회·명예의 전당 SEO', () => {
  it('각 목록은 별도 canonical과 제목을 가지며 실제 대회로 연결해야 한다', () => {
    expect(groupContestsMetadata(data, false, origin).alternates?.canonical).toBe(
      `${origin}/groups/group/contests`,
    );
    expect(groupContestsMetadata(data, true, origin).alternates?.canonical).toBe(
      `${origin}/groups/group/hall-of-fame`,
    );
    const hall = groupContestsJsonLd(data, true, origin);
    expect(hall?.['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'CollectionPage',
          name: '웃음 그룹 - 명예의 전당',
          mainEntity: expect.objectContaining({ numberOfItems: 1 }),
        }),
      ]),
    );
    expect(JSON.stringify(hall)).toContain(`${origin}/groups/group/contests/contest`);
    expect(JSON.stringify(hall)).not.toContain('award');
  });
  it('비공개 목록은 제목·대회·공유 사진을 검색에 공개하지 않아야 한다', () => {
    const secret = { ...data, group: { ...data.group, visibility: GroupVisibility.Private } };
    for (const hall of [false, true]) {
      const metadata = groupContestsMetadata(secret, hall, origin);
      expect(metadata.robots).toMatchObject({ index: false, follow: false });
      expect(JSON.stringify(metadata)).not.toContain('지난 대회');
      expect(groupContestsJsonLd(secret, hall, origin)).toBeNull();
    }
  });
});
