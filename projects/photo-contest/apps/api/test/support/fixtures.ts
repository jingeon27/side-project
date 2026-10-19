import type { ITestApi, ITestUser } from './app';

const HOUR_MS = 60 * 60 * 1000;

export interface ITestGroup {
  id: string;
  inviteToken: string;
}

export interface IContestSchedule {
  startsAt: string;
  submissionEndsAt: string;
  endsAt: string;
}

export const CREATE_CONTEST = `
  mutation($groupId: ID!, $title: String!, $startsAt: DateTime!, $submissionEndsAt: DateTime!, $endsAt: DateTime!) {
    createContest(groupId: $groupId, title: $title, startsAt: $startsAt, submissionEndsAt: $submissionEndsAt, endsAt: $endsAt) {
      id
      phase
    }
  }
`;

const CREATE_GROUP =
  'mutation($name: String!, $visibility: GroupVisibility!) { createGroup(name: $name, visibility: $visibility) { id inviteToken } }';
const JOIN_GROUP = 'mutation($token: String!) { joinGroup(token: $token) { id role } }';

/** 지금 시작해 제출 1시간, 투표 1시간인 일정 */
export function contestSchedule(now = Date.now()): IContestSchedule {
  return {
    startsAt: new Date(now).toISOString(),
    submissionEndsAt: new Date(now + HOUR_MS).toISOString(),
    endsAt: new Date(now + 2 * HOUR_MS).toISOString(),
  };
}

/** owner가 그룹을 만들고 members가 초대 토큰으로 가입한다. */
export async function createGroup(
  api: ITestApi,
  owner: ITestUser,
  name: string,
  members: readonly ITestUser[] = [],
  visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
): Promise<ITestGroup> {
  const { createGroup: group } = await api.gqlOk<{ createGroup: ITestGroup }>(owner.cookie, CREATE_GROUP, {
    name,
    visibility,
  });
  for (const member of members) await joinGroup(api, member, group.inviteToken, owner);
  return group;
}

export async function joinGroup(api: ITestApi, user: ITestUser, inviteToken: string, owner?: ITestUser) {
  const { joinGroup: group } = await api.gqlOk<{ joinGroup: { id: string; role: string | null } }>(
    user.cookie,
    JOIN_GROUP,
    { token: inviteToken },
  );
  if (group.role || !owner) return;
  const { groupJoinRequests } = await api.gqlOk<{
    groupJoinRequests: Array<{ id: string; user: { id: string } }>;
  }>(owner.cookie, 'query($id:ID!){groupJoinRequests(groupId:$id){id user{id}}}', { id: group.id });
  const request = groupJoinRequests.find((row) => row.user.id === user.id);
  if (!request) throw new Error('비공개 그룹 가입 신청이 있어야 한다');
  await api.gqlOk(owner.cookie, 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}', {
    id: request.id,
  });
}

/** 그룹 관리자가 지금 제출 기간인 대회를 만든다. */
export async function createContest(
  api: ITestApi,
  owner: ITestUser,
  groupId: string,
  title = '테스트 대회',
): Promise<string> {
  const { createContest: contest } = await api.gqlOk<{ createContest: { id: string } }>(
    owner.cookie,
    CREATE_CONTEST,
    { groupId, title, ...contestSchedule() },
  );
  return contest.id;
}

const CAST_VOTE = `
  mutation($contestId: ID!, $submissionId: ID!) {
    castVote(contestId: $contestId, submissionId: $submissionId) { id }
  }
`;
const LIKE = 'mutation($id: ID!) { likeSubmission(submissionId: $id) { id } }';
const HIDE = 'mutation($id: ID!) { hideSubmission(submissionId: $id) }';

/** 투표 기간인 대회에서 voter가 한 표를 던진다. */
export async function castVote(api: ITestApi, voter: ITestUser, contestId: string, submissionId: string) {
  await api.gqlOk(voter.cookie, CAST_VOTE, { contestId, submissionId });
}

/** users가 차례로 사진에 좋아요를 누른다. */
export async function likePhoto(api: ITestApi, submissionId: string, users: readonly ITestUser[]) {
  for (const user of users) await api.gqlOk(user.cookie, LIKE, { id: submissionId });
}

/** 그룹 관리자가 사진을 숨긴다. */
export async function hidePhoto(api: ITestApi, owner: ITestUser, submissionId: string) {
  await api.gqlOk(owner.cookie, HIDE, { id: submissionId });
}
