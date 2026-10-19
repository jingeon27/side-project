import { createTestImage, graphqlRequest } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './env';

export async function productRequest<T>(
  cookie: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const result = await graphqlRequest<T>(`${WEB_ORIGIN}/backend`, {
    cookie,
    origin: WEB_ORIGIN,
    query,
    variables,
  });
  if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

export async function seedContest(cookie: string, groupId: string, title: string): Promise<string> {
  const now = Date.now();
  const data = await productRequest<{ createContest: { id: string } }>(
    cookie,
    'mutation($groupId: ID!, $title: String!, $startsAt: DateTime!, $submissionEndsAt: DateTime!, $endsAt: DateTime!) { createContest(groupId: $groupId, title: $title, startsAt: $startsAt, submissionEndsAt: $submissionEndsAt, endsAt: $endsAt) { id } }',
    {
      groupId,
      title,
      startsAt: new Date(now).toISOString(),
      submissionEndsAt: new Date(now + 3_600_000).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
    },
  );
  return data.createContest.id;
}

export async function seedPhoto(cookie: string, contestId: string, caption: string): Promise<string> {
  const { requestUploadUrl: ticket } = await productRequest<{
    requestUploadUrl: { id: string; url: string };
  }>(cookie, 'mutation($contestId: ID!) { requestUploadUrl(contestId: $contestId) { id url } }', {
    contestId,
  });
  const response = await fetch(API_URL + ticket.url.replace(/^\/backend/, ''), {
    method: 'POST',
    headers: { Cookie: cookie, Origin: WEB_ORIGIN, 'Content-Type': 'image/png' },
    body: new Uint8Array(await createTestImage()),
  });
  if (response.status !== 201) throw new Error('테스트 사진 업로드 실패');
  return (
    await productRequest<{ createSubmission: { id: string } }>(
      cookie,
      'mutation($contestId: ID!, $uploadId: ID!, $caption: String!) { createSubmission(contestId: $contestId, uploadId: $uploadId, caption: $caption, rightsConfirmed: true) { id } }',
      { contestId, uploadId: ticket.id, caption },
    )
  ).createSubmission.id;
}

export async function seedPost(
  cookie: string,
  groupId: string,
  title: string,
  imageOptions?: Parameters<typeof createTestImage>[0],
): Promise<string> {
  const { requestPostUpload: ticket } = await productRequest<{
    requestPostUpload: { id: string; url: string };
  }>(cookie, 'mutation($groupId:ID!){requestPostUpload(groupId:$groupId){id url}}', { groupId });
  const response = await fetch(API_URL + ticket.url.replace(/^\/backend/, ''), {
    method: 'POST',
    headers: { Cookie: cookie, Origin: WEB_ORIGIN, 'Content-Type': 'image/png' },
    body: new Uint8Array(await createTestImage(imageOptions)),
  });
  if (response.status !== 201) throw new Error('테스트 게시물 업로드 실패');
  return (
    await productRequest<{ createPost: { id: string } }>(
      cookie,
      'mutation($groupId:ID!,$uploadId:ID!,$title:String!){createPost(groupId:$groupId,uploadId:$uploadId,title:$title,rightsConfirmed:true){id}}',
      { groupId, uploadId: ticket.id, title },
    )
  ).createPost.id;
}
