import { graphqlRequest } from './http';

interface ITestPostUpload {
  cookie: string;
  origin: string;
  groupId: string;
  body: Uint8Array;
  contentType: string;
}

/** 브라우저와 같은 presign → 저장소 POST → complete 계약으로 테스트 첨부를 준비한다. */
export async function uploadTestPostMedia(
  apiUrl: string,
  { cookie, origin, groupId, body, contentType }: ITestPostUpload,
) {
  const requested = await graphqlRequest<{
    requestPostUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
  }>(apiUrl, {
    cookie,
    origin,
    query:
      'mutation($groupId:ID!,$type:String!,$size:Int!){requestPostUpload(groupId:$groupId,contentType:$type,byteSize:$size){id url fields{name value}}}',
    variables: { groupId, type: contentType, size: body.byteLength },
  });
  if (!requested.data || requested.errors?.length) throw new Error(JSON.stringify(requested.errors));
  const ticket = requested.data.requestPostUpload;
  const form = new FormData();
  for (const field of ticket.fields) form.append(field.name, field.value);
  form.append('file', new Blob([new Uint8Array(body)], { type: contentType }), 'media');
  const response = await fetch(ticket.url, { method: 'POST', headers: { Origin: origin }, body: form });
  if (!response.ok) throw new Error(`테스트 게시물 업로드 실패 (${response.status})`);
  const completed = await graphqlRequest<{ completePostUpload: { id: string } }>(apiUrl, {
    cookie,
    origin,
    query: 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}',
    variables: { id: ticket.id },
  });
  if (!completed.data || completed.errors?.length) throw new Error(JSON.stringify(completed.errors));
  return completed.data.completePostUpload.id;
}
