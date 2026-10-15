import { InMemoryCache } from '@apollo/client';
import { describe, expect, it } from 'vitest';

import { MyPhotoFeedDocument, Phase, SubmissionLikeFragmentDoc } from '@/shared/api/generated';
import type { MyPhotoFeedQuery } from '@/shared/api/generated';

import { resetPhotoFeed } from './feed.cache';
import { feedTypePolicies } from './feed.type-policies';

const VARIABLES = { offset: 0, limit: 2 };
function item(id: string, groupId: string): MyPhotoFeedQuery['myPhotoFeed'][number] {
  return {
    __typename: 'PhotoFeedItem',
    id,
    groupId,
    groupName: groupId,
    contestTitle: '사진 대회',
    phase: Phase.Submission,
    submission: {
      __typename: 'Submission',
      id,
      contestId: 'contest-' + groupId,
      caption: '사진-' + id,
      imageUrl: '/backend/photos/' + id,
      hidden: false,
      createdAt: '2026-10-15T00:00:00Z',
      likeCount: 0,
      likedByMe: false,
      author: { __typename: 'User', id: 'author', nickname: '친구', avatar: null },
    },
  };
}
function seed(cache: InMemoryCache) {
  cache.writeQuery({
    query: MyPhotoFeedDocument,
    variables: VARIABLES,
    data: { myPhotoFeed: [item('new', 'a'), item('middle', 'b')] },
  });
  cache.writeQuery({
    query: MyPhotoFeedDocument,
    variables: { ...VARIABLES, offset: 2 },
    data: { myPhotoFeed: [item('old', 'a')] },
  });
}

describe('홈 피드 캐시', () => {
  it('그룹이 섞인 페이지를 서버 순서대로 합치고 대회의 좋아요 변경도 같은 사진에 반영해야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: feedTypePolicies });
    seed(cache);
    cache.writeFragment({
      id: 'Submission:new',
      fragment: SubmissionLikeFragmentDoc,
      data: { __typename: 'Submission', id: 'new', likeCount: 1, likedByMe: true },
    });
    const data = cache.readQuery({ query: MyPhotoFeedDocument, variables: VARIABLES });
    expect(data?.myPhotoFeed.map(({ id }) => id)).toEqual(['new', 'middle', 'old']);
    expect(data?.myPhotoFeed[0]?.submission).toMatchObject({ likeCount: 1, likedByMe: true });
  });

  it('가입·사진 제출·숨김 뒤 목록을 비우면 예전 뒷페이지가 새 첫 페이지에 섞이지 않아야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: feedTypePolicies });
    seed(cache);
    resetPhotoFeed(cache);
    expect(cache.readQuery({ query: MyPhotoFeedDocument, variables: VARIABLES })).toBeNull();
    cache.writeQuery({
      query: MyPhotoFeedDocument,
      variables: VARIABLES,
      data: { myPhotoFeed: [item('fresh', 'c')] },
    });
    expect(
      cache.readQuery({ query: MyPhotoFeedDocument, variables: VARIABLES })?.myPhotoFeed.map(({ id }) => id),
    ).toEqual(['fresh']);
  });
});
