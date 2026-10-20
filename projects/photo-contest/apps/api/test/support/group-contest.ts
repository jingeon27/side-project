import { createTestImage, createTestVideo } from '@photo-contest/test-kit';
import { TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from './app';
import { contestSchedule } from './fixtures';

export const GROUP_CONTEST_FIELDS =
  'id groupId title phase isAdmin canParticipate canVote votedPostId entryCount';
export const CREATE_GROUP_CONTEST = `mutation($groupId:ID!,$title:String!,$startsAt:DateTime!,$submissionEndsAt:DateTime!,$endsAt:DateTime!){createGroupContest(groupId:$groupId,title:$title,startsAt:$startsAt,submissionEndsAt:$submissionEndsAt,endsAt:$endsAt){${GROUP_CONTEST_FIELDS}}}`;
export const GROUP_CONTEST = `query($id:ID!){groupContest(id:$id){${GROUP_CONTEST_FIELDS}}}`;
export const CAST_POST_VOTE = `mutation($id:ID!,$postId:ID!){castGroupContestVote(contestId:$id,postId:$postId){${GROUP_CONTEST_FIELDS}}}`;
export const SET_MODERATOR =
  'mutation($id:ID!,$user:ID!,$enabled:Boolean!){setGroupModerator(groupId:$id,userId:$user,enabled:$enabled){id role members{role user{id}}}}';
export const TRANSFER_OWNER =
  'mutation($id:ID!,$user:ID!){transferGroupOwnership(groupId:$id,userId:$user){id role members{role user{id}}}}';

export async function createGroupContest(
  api: ITestApi,
  owner: ITestUser,
  groupId: string,
  title = '그룹 게시물 대회',
) {
  return (
    await api.gqlOk<{ createGroupContest: { id: string } }>(owner.cookie, CREATE_GROUP_CONTEST, {
      groupId,
      title,
      ...contestSchedule(),
    })
  ).createGroupContest.id;
}

export async function postUpload(api: ITestApi, author: ITestUser, groupId: string, video = false) {
  const { requestPostUpload } = await api.gqlOk<{ requestPostUpload: { id: string; url: string } }>(
    author.cookie,
    'mutation($id:ID!){requestPostUpload(groupId:$id){id url}}',
    { id: groupId },
  );
  const response = await api
    .http()
    .post(requestPostUpload.url.replace('/backend', ''))
    .set('Origin', TEST_WEB_ORIGIN)
    .set('Cookie', author.cookie)
    .set('Content-Type', video ? 'video/mp4' : 'image/png')
    .send(video ? await createTestVideo() : await createTestImage());
  if (response.status !== 201) throw new Error('실제 게시물 미디어 업로드 실패');
  return requestPostUpload.id;
}

export async function createEntry(
  api: ITestApi,
  author: ITestUser,
  groupId: string,
  contestId: string | null,
  video = false,
) {
  const uploadId = await postUpload(api, author, groupId, video);
  return (
    await api.gqlOk<{ createPost: { id: string; kind: string; contestId: string | null } }>(
      author.cookie,
      'mutation($group:ID!,$upload:ID!,$contest:ID){createPost(groupId:$group,uploadId:$upload,contestId:$contest,title:"대회 참여 순간",rightsConfirmed:true){id kind contestId}}',
      { group: groupId, upload: uploadId, contest: contestId },
    )
  ).createPost;
}

export async function moveGroupContest(
  api: ITestApi,
  id: string,
  target: 'UPCOMING' | 'SUBMISSION' | 'VOTING' | 'COMPLETED',
) {
  const offsets = {
    UPCOMING: [1, 2, 3],
    SUBMISSION: [-1, 1, 2],
    VOTING: [-2, -1, 1],
    COMPLETED: [-3, -2, -1],
  }[target];
  const [start = 0, submission = 0, end = 0] = offsets;
  const now = Date.now();
  await api.db.contest.update({
    where: { id },
    data: {
      startsAt: new Date(now + start * 3_600_000),
      submissionEndsAt: new Date(now + submission * 3_600_000),
      endsAt: new Date(now + end * 3_600_000),
    },
  });
}
