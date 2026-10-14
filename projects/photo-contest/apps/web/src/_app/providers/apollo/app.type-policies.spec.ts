import { InMemoryCache, gql } from '@apollo/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_TYPE_POLICIES } from './app.type-policies';

const SUBMISSIONS = gql`
  query Submissions($contestId: ID!, $sort: SubmissionSort, $offset: Int, $limit: Int) {
    submissions(contestId: $contestId, sort: $sort, offset: $offset, limit: $limit) {
      id
      caption
    }
  }
`;
const GROUP = gql`
  query Group($id: ID!) {
    group(id: $id) {
      id
      members {
        role
        user {
          id
          nickname
        }
      }
    }
  }
`;
const CONTEST = gql`
  query Contest($id: ID!) {
    contest(id: $id) {
      id
      hiddenSubmissions {
        id
        caption
      }
    }
  }
`;

interface ISubmissionsData {
  submissions: Array<{ __typename: 'Submission'; id: string; caption: string }>;
}

const submission = (id: string) => ({ __typename: 'Submission' as const, id, caption: `사진 ${id}` });

function writePage(
  cache: InMemoryCache,
  { sort, offset, ids }: { sort: string; offset: number; ids: string[] },
) {
  cache.writeQuery({
    query: SUBMISSIONS,
    variables: { contestId: 'c1', sort, offset, limit: 2 },
    data: { submissions: ids.map(submission) },
  });
}

const readIds = (cache: InMemoryCache, sort: string) =>
  cache
    .readQuery<ISubmissionsData>({
      query: SUBMISSIONS,
      variables: { contestId: 'c1', sort, offset: 0, limit: 2 },
    })
    ?.submissions.map(({ id }) => id);

describe('APP_TYPE_POLICIES', () => {
  afterEach(() => vi.restoreAllMocks());

  it('사진 목록은 정렬마다 따로 두고 더 받은 페이지를 offset 자리에 이어 붙여야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: APP_TYPE_POLICIES });
    writePage(cache, { sort: 'NEWEST', offset: 0, ids: ['s3', 's2'] });
    writePage(cache, { sort: 'NEWEST', offset: 2, ids: ['s1'] });
    writePage(cache, { sort: 'MOST_LIKED', offset: 0, ids: ['s1', 's3'] });

    expect(readIds(cache, 'NEWEST')).toEqual(['s3', 's2', 's1']);
    expect(readIds(cache, 'MOST_LIKED')).toEqual(['s1', 's3']);
  });

  it('첫 페이지를 다시 받아도(앱 복귀·내 제출 후) 더 불러온 사진은 남아야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: APP_TYPE_POLICIES });
    writePage(cache, { sort: 'NEWEST', offset: 0, ids: ['s3', 's2'] });
    writePage(cache, { sort: 'NEWEST', offset: 2, ids: ['s1'] });
    writePage(cache, { sort: 'NEWEST', offset: 0, ids: ['s3', 's2'] });

    expect(readIds(cache, 'NEWEST')).toEqual(['s3', 's2', 's1']);
  });

  it('캐시에서 지운(evict) 사진은 목록에서 빠져야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: APP_TYPE_POLICIES });
    writePage(cache, { sort: 'NEWEST', offset: 0, ids: ['s3', 's2'] });
    cache.evict({ id: cache.identify(submission('s3')) });

    expect(readIds(cache, 'NEWEST')).toEqual(['s2']);
  });

  it('그룹 멤버와 숨긴 사진 목록은 경고 없이 서버 응답으로 바꿔야 한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cache = new InMemoryCache({ typePolicies: APP_TYPE_POLICIES });
    const member = (id: string) => ({
      __typename: 'Member',
      role: 'MEMBER',
      user: { __typename: 'User', id, nickname: id },
    });
    const writeGroup = (ids: string[]) =>
      cache.writeQuery({
        query: GROUP,
        variables: { id: 'g1' },
        data: { group: { __typename: 'Group', id: 'g1', members: ids.map(member) } },
      });
    writeGroup(['u1', 'u2']);
    writeGroup(['u2']);

    const writeHidden = (ids: string[]) =>
      cache.writeQuery({
        query: CONTEST,
        variables: { id: 'c1' },
        data: { contest: { __typename: 'Contest', id: 'c1', hiddenSubmissions: ids.map(submission) } },
      });
    writeHidden(['s1', 's2']);
    writeHidden(['s2']);

    expect(
      cache.readQuery<{ group: { members: unknown[] } }>({ query: GROUP, variables: { id: 'g1' } })?.group
        .members,
    ).toHaveLength(1);
    expect(
      cache.readQuery<{ contest: { hiddenSubmissions: unknown[] } }>({
        query: CONTEST,
        variables: { id: 'c1' },
      })?.contest.hiddenSubmissions,
    ).toEqual([submission('s2')]);
    expect(warn).not.toHaveBeenCalled();
  });
});
