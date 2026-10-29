import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { contestSchedule, createGroup } from '../../test/support/fixtures';

const CREATE_POST =
  'mutation($groupId:ID!,$contestId:ID){createPost(groupId:$groupId,contestId:$contestId,title:"동시 반응 링크",linkUrl:"https://example.com",rightsConfirmed:true){id}}';
const LIKE = 'mutation($id:ID!){likePost(postId:$id){id likedByMe}}';
const UNLIKE = 'mutation($id:ID!){unlikePost(postId:$id){id likedByMe}}';
const POST = 'query($id:ID!){galleryPost(id:$id){likeCount}}';
const CREATE_CONTEST =
  'mutation($groupId:ID!,$startsAt:DateTime!,$submissionEndsAt:DateTime!,$endsAt:DateTime!,$likeLimit:Int!){createGroupContest(groupId:$groupId,title:"동시 반응 대회",startsAt:$startsAt,submissionEndsAt:$submissionEndsAt,endsAt:$endsAt,likeLimit:$likeLimit){id}}';

describe('PostService 동시 반응 회귀', () => {
  const state: { api?: ITestApi; owner?: ITestUser; members: ITestUser[]; groupId?: string } = {
    members: [],
  };

  beforeAll(async () => {
    const api = await createTestApp();
    state.api = api;
    const owner = await api.signIn('게시물 동시 반응 관리자');
    state.owner = owner;
    state.members = await Promise.all(
      Array.from({ length: 8 }, (_, index) => api.signIn(`게시물 동시 반응 회원 ${index}`)),
    );
    state.groupId = (await createGroup(api, owner, '게시물 동시 반응 그룹', state.members)).id;
  });

  afterAll(async () => {
    await state.api?.close();
  });

  const fixture = () => {
    if (!state.api || !state.owner || !state.groupId) throw new Error('동시 반응 준비가 필요합니다.');
    return { api: state.api, owner: state.owner, members: state.members, groupId: state.groupId };
  };

  const createPost = async (contestId?: string) => {
    const { api, owner, groupId } = fixture();
    const { createPost: post } = await api.gqlOk<{ createPost: { id: string } }>(owner.cookie, CREATE_POST, {
      groupId,
      contestId,
    });
    return post;
  };

  const createContest = async (likeLimit = 1) => {
    const { api, owner, groupId } = fixture();
    const { createGroupContest: contest } = await api.gqlOk<{ createGroupContest: { id: string } }>(
      owner.cookie,
      CREATE_CONTEST,
      { groupId, likeLimit, ...contestSchedule() },
    );
    return contest;
  };

  it('서로 다른 회원의 동시 좋아요와 취소가 모두 성공하고 각자의 반응만 바꿔야 한다', async () => {
    const { api, owner, members } = fixture();
    const post = await createPost();
    const liked = await Promise.all(members.map((member) => api.gql(member.cookie, LIKE, { id: post.id })));
    for (const result of liked) {
      expect(result.errors).toBeUndefined();
      expect(result.data).toMatchObject({ likePost: { likedByMe: true } });
    }
    expect(await api.db.postLike.count({ where: { postId: post.id } })).toBe(members.length);
    expect(await api.gqlOk(owner.cookie, POST, { id: post.id })).toEqual({
      galleryPost: { likeCount: members.length },
    });
    expect(
      await api.db.analyticsEvent.count({
        where: { id: { in: members.map((member) => `post-like:${post.id}:${member.id}`) } },
      }),
    ).toBe(members.length);

    const cancelled = await Promise.all(
      members.map((member) => api.gql(member.cookie, UNLIKE, { id: post.id })),
    );
    for (const result of cancelled) {
      expect(result.errors).toBeUndefined();
      expect(result.data).toMatchObject({ unlikePost: { likedByMe: false } });
    }
    expect(await api.db.postLike.count({ where: { postId: post.id } })).toBe(0);
  });

  it('같은 회원의 동시 재전송도 모두 성공하고 좋아요와 이벤트는 하나만 남아야 한다', async () => {
    const { api, owner } = fixture();
    const post = await createPost();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => api.gql(owner.cookie, LIKE, { id: post.id })),
    );
    for (const response of responses) {
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchObject({ likePost: { likedByMe: true } });
    }
    expect(await api.db.postLike.count({ where: { postId: post.id } })).toBe(1);
    expect(await api.db.analyticsEvent.count({ where: { id: `post-like:${post.id}:${owner.id}` } })).toBe(1);
  });

  it('대회 작품도 서로 다른 회원의 동시 좋아요가 모두 성공해야 한다', async () => {
    const { api, members } = fixture();
    const contest = await createContest();
    const post = await createPost(contest.id);
    const responses = await Promise.all(
      members.map((member) => api.gql(member.cookie, LIKE, { id: post.id })),
    );
    for (const response of responses) {
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchObject({ likePost: { likedByMe: true } });
    }
    expect(await api.db.postLike.count({ where: { postId: post.id } })).toBe(members.length);
  });

  it('동시 요청이 다른 대회 작품으로 향해도 한도를 지키고 취소하면 다른 작품을 고를 수 있어야 한다', async () => {
    const { api, members } = fixture();
    const member = members[0];
    if (!member) throw new Error('반응 회원이 필요합니다.');
    const contest = await createContest();
    const posts = [];
    for (const index of Array.from({ length: 8 }, (_, index) => index)) {
      posts[index] = await createPost(contest.id);
    }
    const responses = await Promise.all(posts.map((post) => api.gql(member.cookie, LIKE, { id: post.id })));
    expect(responses.filter((response) => !response.errors?.length)).toHaveLength(1);
    const errors = responses.flatMap((response) => response.errors ?? []);
    expect(errors).toHaveLength(posts.length - 1);
    for (const error of errors) expect(error.message).toContain('1개 작품까지만');
    expect(
      await api.db.postLike.count({ where: { userId: member.id, post: { contestId: contest.id } } }),
    ).toBe(1);
    const selected = await api.db.postLike.findFirstOrThrow({
      where: { userId: member.id, post: { contestId: contest.id } },
    });
    await api.gqlOk(member.cookie, UNLIKE, { id: selected.postId });
    const next = posts.find((post) => post.id !== selected.postId);
    if (!next) throw new Error('대체 작품이 필요합니다.');
    await api.gqlOk(member.cookie, LIKE, { id: next.id });
    await api.gqlOk(member.cookie, LIKE, { id: next.id });
    expect(
      await api.db.postLike.count({ where: { userId: member.id, post: { contestId: contest.id } } }),
    ).toBe(1);
  });

  it('설정한 한도를 회원별로 따로 지키고 다른 대회 반응에는 영향을 주지 않아야 한다', async () => {
    const { api, members } = fixture();
    const contest = await createContest(2);
    const posts = [];
    for (const index of Array.from({ length: 4 }, (_, index) => index)) {
      posts[index] = await createPost(contest.id);
    }
    for (const member of members.slice(0, 2)) {
      const responses = await Promise.all(posts.map((post) => api.gql(member.cookie, LIKE, { id: post.id })));
      expect(responses.filter((response) => !response.errors?.length)).toHaveLength(2);
      for (const error of responses.flatMap((response) => response.errors ?? []))
        expect(error.message).toContain('2개 작품까지만');
      expect(
        await api.db.postLike.count({ where: { userId: member.id, post: { contestId: contest.id } } }),
      ).toBe(2);
    }
    const member = members[0];
    if (!member) throw new Error('반응 회원이 필요합니다.');
    const other = await createContest();
    const post = await createPost(other.id);
    await api.gqlOk(member.cookie, LIKE, { id: post.id });
  });

  it('숨긴 대회 작품의 좋아요는 한도에서 빼고 다른 작품을 고를 수 있어야 한다', async () => {
    const { api, owner, members } = fixture();
    const member = members[0];
    if (!member) throw new Error('반응 회원이 필요합니다.');
    const contest = await createContest();
    const first = await createPost(contest.id);
    const next = await createPost(contest.id);
    await api.gqlOk(member.cookie, LIKE, { id: first.id });
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', {
      id: first.id,
    });
    await api.gqlOk(member.cookie, LIKE, { id: next.id });
    expect(
      await api.db.postLike.count({
        where: { userId: member.id, post: { contestId: contest.id, hidden: false } },
      }),
    ).toBe(1);
  });

  it('비회원과 숨긴 게시물에는 반응을 새로 남기지 못해야 한다', async () => {
    const { api, owner, members } = fixture();
    const post = await createPost();
    const outsider = await api.signIn('게시물 동시 반응 외부 회원');
    expect((await api.gqlFail(outsider.cookie, LIKE, { id: post.id })).code).toBe('FORBIDDEN');
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', {
      id: post.id,
    });
    const member = members[0];
    if (!member) throw new Error('반응 회원이 필요합니다.');
    expect((await api.gqlFail(member.cookie, LIKE, { id: post.id })).code).toBe('NOT_FOUND');
    expect(await api.db.postLike.count({ where: { postId: post.id } })).toBe(0);
  });
});
