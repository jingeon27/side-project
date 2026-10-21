import {
  createTestImage,
  graphqlRequest,
  uploadTestPostMedia,
  uploadTestSubmissionMedia,
} from '@photo-contest/test-kit';

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
  const uploadId = await uploadTestSubmissionMedia(API_URL, {
    cookie,
    origin: WEB_ORIGIN,
    contestId,
    body: await createTestImage(),
    contentType: 'image/png',
  });
  return (
    await productRequest<{ createSubmission: { id: string } }>(
      cookie,
      'mutation($contestId: ID!, $uploadId: ID!, $caption: String!) { createSubmission(contestId: $contestId, uploadId: $uploadId, caption: $caption, rightsConfirmed: true) { id } }',
      { contestId, uploadId, caption },
    )
  ).createSubmission.id;
}

export async function seedPost(
  cookie: string,
  groupId: string,
  title: string,
  imageOptions?: Parameters<typeof createTestImage>[0],
): Promise<string> {
  const uploadId = await uploadTestPostMedia(API_URL, {
    cookie,
    origin: WEB_ORIGIN,
    groupId,
    body: await createTestImage(imageOptions),
    contentType: 'image/png',
  });
  return (
    await productRequest<{ createPost: { id: string } }>(
      cookie,
      'mutation($groupId:ID!,$uploadId:ID!,$title:String!){createPost(groupId:$groupId,uploadId:$uploadId,title:$title,rightsConfirmed:true){id}}',
      { groupId, uploadId, title },
    )
  ).createPost.id;
}
