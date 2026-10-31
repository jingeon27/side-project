import {
  createLegacyTestContest,
  createTestImage,
  graphqlRequest,
  uploadTestPostMedia,
} from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './env';

/** 브라우저가 서명 POST로 실제 S3 버킷에 직접 올리는 요청. 객체 조회(/버킷/키)와 구분한다. */
export function isStorageUpload(url: URL) {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  return (
    url.origin !== WEB_ORIGIN &&
    Boolean(bucket && region) &&
    ((url.hostname === `${bucket}.s3.${region}.amazonaws.com` && url.pathname === '/') ||
      (url.hostname === `s3.${region}.amazonaws.com` && url.pathname === `/${bucket}`))
  );
}

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
  return (await createLegacyTestContest(API_URL, { cookie, groupId, title, origin: WEB_ORIGIN })).id;
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
