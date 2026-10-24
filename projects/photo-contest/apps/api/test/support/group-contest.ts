import { createTestImage, createTestVideo } from '@photo-contest/test-kit';

import { uploadToStorage, type ITestApi, type ITestUser } from './app';
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
  const contentType = video ? 'video/mp4' : 'image/png';
  const body = video ? await createTestVideo() : await createTestImage();
  const { requestPostUpload: ticket } = await api.gqlOk<{
    requestPostUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
  }>(
    author.cookie,
    'mutation($id:ID!,$type:String!,$size:Int!){requestPostUpload(groupId:$id,contentType:$type,byteSize:$size){id url fields{name value}}}',
    { id: groupId, type: contentType, size: body.length },
  );
  const response = await uploadToStorage(ticket, body, contentType);
  if (response.status !== 204) throw new Error('실제 게시물 미디어 업로드 실패');
  await api.gqlOk(author.cookie, 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}', {
    id: ticket.id,
  });
  return ticket.id;
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
