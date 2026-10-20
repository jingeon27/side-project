import { createTestImage, createTestUser, graphqlRequest } from '@photo-contest/test-kit';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../e2e/support/test';
import { CACHE_API_URL, CACHE_WEB_ORIGIN } from './env';

async function product<T>(cookie: string, query: string, variables: Record<string, unknown> = {}) {
  const result = await graphqlRequest<T>(CACHE_API_URL, {
    cookie,
    origin: CACHE_WEB_ORIGIN,
    query,
    variables,
  });
  if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

async function upload(cookie: string, groupId: string) {
  const { requestPostUpload: ticket } = await product<{ requestPostUpload: { id: string; url: string } }>(
    cookie,
    'mutation($group:ID!){requestPostUpload(groupId:$group){id url}}',
    { group: groupId },
  );
  expect(
    (
      await fetch(CACHE_API_URL + ticket.url.replace('/backend', ''), {
        method: 'POST',
        headers: { Cookie: cookie, Origin: CACHE_WEB_ORIGIN, 'Content-Type': 'image/png' },
        body: new Uint8Array(await createTestImage()),
      })
    ).status,
  ).toBe(201);
  return ticket.id;
}

const CREATE_POST =
  'mutation($group:ID!,$upload:ID!,$title:String!){createPost(groupId:$group,uploadId:$upload,title:$title,rightsConfirmed:true){id}}';

test('공개 홈은 익명 캐시를 재사용하고 숨김 직후 갱신하며 개인 피드와 섞이지 않아야 한다', async ({
  request,
}) => {
  const cookie = await createTestUser(CACHE_API_URL, { origin: CACHE_WEB_ORIGIN, nickname: '홈 캐시 회원' });
  const { createGroup: group } = await product<{ createGroup: { id: string } }>(
    cookie,
    'mutation{createGroup(name:"홈 캐시 공개",visibility:PUBLIC){id}}',
  );
  const { createGroup: secret } = await product<{ createGroup: { id: string } }>(
    cookie,
    'mutation{createGroup(name:"홈 캐시 비공개",visibility:PRIVATE){id}}',
  );
  await product(cookie, CREATE_POST, {
    group: secret.id,
    upload: await upload(cookie, secret.id),
    title: '홈에 공유하면 안 되는 사진',
  });
  const first = await product<{ createPost: { id: string } }>(cookie, CREATE_POST, {
    group: group.id,
    upload: await upload(cookie, group.id),
    title: '홈 캐시 첫 사진',
  });
  const home = () =>
    request.get('/', { headers: { 'User-Agent': 'Twitterbot' } }).then((response) => response.text());
  expect(await home()).toContain('홈 캐시 첫 사진');
  expect(await home()).not.toContain('홈에 공유하면 안 되는 사진');
  await product(cookie, CREATE_POST, {
    group: group.id,
    upload: await upload(cookie, group.id),
    title: '홈 캐시 뒤에 올린 사진',
  });
  expect(await home()).not.toContain('홈 캐시 뒤에 올린 사진');
  const hidden = await request.post('/backend/graphql', {
    headers: { Cookie: cookie, Origin: CACHE_WEB_ORIGIN },
    data: {
      query: 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}',
      variables: { id: first.createPost.id },
    },
  });
  expect((await hidden.json()).errors).toBeUndefined();
  const fresh = await home();
  expect(fresh).toContain('홈 캐시 뒤에 올린 사진');
  expect(fresh).not.toContain('홈 캐시 첫 사진');
  const personal = await request.get('/', { headers: { Cookie: cookie, 'User-Agent': 'Twitterbot' } });
  expect(await personal.text()).toContain('홈에 공유하면 안 되는 사진');
  expect(await home()).not.toContain('홈에 공유하면 안 되는 사진');
});

async function seoTitles(request: APIRequestContext, page: Page, groupId: string) {
  const response = await request.get(`/groups/${groupId}`, { headers: { 'User-Agent': 'Twitterbot' } });
  expect(response.status()).toBe(200);
  return page.evaluate(
    (html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const ld = JSON.parse(d.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
      const collection = ld['@graph']?.find(
        (node: { '@type': string }) => node['@type'] === 'CollectionPage',
      );
      return collection?.mainEntity.itemListElement.map(
        (entry: { item: { headline: string } }) => entry.item.headline,
      ) as string[] | undefined;
    },
    await response.text(),
  );
}

test('프로덕션의 공개 캐시를 재사용하고 정상·부분 성공 mutation 뒤 즉시 무효화해야 한다', async ({
  page,
  request,
}) => {
  const cookie = await createTestUser(CACHE_API_URL, { origin: CACHE_WEB_ORIGIN, nickname: '캐시 운영자' });
  const { createGroup: group } = await product<{ createGroup: { id: string } }>(
    cookie,
    'mutation{createGroup(name:"공개 캐시 그룹"){id}}',
  );
  const first = await product<{ createPost: { id: string } }>(cookie, CREATE_POST, {
    group: group.id,
    upload: await upload(cookie, group.id),
    title: '캐시에 저장한 첫 사진',
  });
  expect(await seoTitles(request, page, group.id)).toEqual(['캐시에 저장한 첫 사진']);

  const second = await product<{ createPost: { id: string } }>(cookie, CREATE_POST, {
    group: group.id,
    upload: await upload(cookie, group.id),
    title: '캐시 밖에서 추가한 사진',
  });
  // API에만 추가한 글은 기존 Next 캐시에 없으므로 요청 간 재사용을 확인할 수 있다.
  expect(await seoTitles(request, page, group.id)).toEqual(['캐시에 저장한 첫 사진']);
  const unauthorized = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: { query: 'mutation($id:ID!){deletePost(postId:$id)}', variables: { id: first.createPost.id } },
  });
  expect((await unauthorized.json()).errors[0].extensions.code).toBe('UNAUTHENTICATED');
  expect(await seoTitles(request, page, group.id)).toEqual(['캐시에 저장한 첫 사진']);

  const mutation = await request.post('/backend/graphql', {
    headers: { Cookie: cookie, Origin: CACHE_WEB_ORIGIN },
    data: { query: 'mutation($id:ID!){likePost(postId:$id){id}}', variables: { id: second.createPost.id } },
  });
  expect((await mutation.json()).errors).toBeUndefined();
  expect(await seoTitles(request, page, group.id)).toEqual([
    '캐시 밖에서 추가한 사진',
    '캐시에 저장한 첫 사진',
  ]);

  const partial = await request.post('/backend/graphql', {
    headers: { Cookie: cookie, Origin: CACHE_WEB_ORIGIN },
    data: {
      query: 'mutation($id:ID!){removed:deletePost(postId:$id) failed:createGroup(name:" "){id}}',
      variables: { id: first.createPost.id },
    },
  });
  const result = await partial.json();
  expect(result.data).toBeNull();
  expect(result.errors[0].path).toEqual(['failed']);
  expect(await seoTitles(request, page, group.id)).toEqual(['캐시 밖에서 추가한 사진']);
});

test('사이트맵 캐시와 쓰기 뒤 갱신을 확인하고 비공개 글을 공유 캐시에 넣지 않아야 한다', async ({
  page,
  request,
}) => {
  const cookie = await createTestUser(CACHE_API_URL, {
    origin: CACHE_WEB_ORIGIN,
    nickname: '사이트맵 캐시 회원',
  });
  const first = await product<{ createGroup: { id: string } }>(
    cookie,
    'mutation{createGroup(name:"사이트맵 첫 그룹"){id}}',
  );
  const initial = await (await request.get('/sitemaps/groups/0.xml')).text();
  expect(initial).toContain(first.createGroup.id);
  const second = await product<{ createGroup: { id: string } }>(
    cookie,
    'mutation{createGroup(name:"아직 캐시에 없는 그룹"){id}}',
  );
  expect(await (await request.get('/sitemaps/groups/0.xml')).text()).not.toContain(second.createGroup.id);
  const write = await request.post('/backend/graphql', {
    headers: { Cookie: cookie, Origin: CACHE_WEB_ORIGIN },
    data: { query: 'mutation{createGroup(name:"웹에서 만든 그룹"){id}}' },
  });
  expect((await write.json()).errors).toBeUndefined();
  expect(await (await request.get('/sitemaps/groups/0.xml')).text()).toContain(second.createGroup.id);

  const { createGroup: secret } = await product<{ createGroup: { id: string } }>(
    cookie,
    'mutation{createGroup(name:"비공개 캐시 제외",visibility:PRIVATE){id}}',
  );
  await product(cookie, CREATE_POST, {
    group: secret.id,
    upload: await upload(cookie, secret.id),
    title: '공유 캐시에 담기면 안 되는 비밀',
  });
  for (const session of [cookie, '']) {
    const html = await (
      await request.get(`/groups/${secret.id}`, {
        headers: { 'User-Agent': 'Twitterbot', ...(session ? { Cookie: session } : {}) },
      })
    ).text();
    const seo = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        robots: d.querySelector('meta[name="robots"]')?.getAttribute('content'),
        count: d.querySelectorAll('script[type="application/ld+json"]').length,
      };
    }, html);
    expect(seo.robots).toContain('noindex');
    expect(seo.count).toBe(0);
  }
  expect(await (await request.get('/sitemaps/groups/0.xml')).text()).not.toContain(secret.id);
});

test('프록시는 Origin·본문 한도를 지키고 업로드 스트림·인증 쿠키를 전달해야 한다', async ({ request }) => {
  const foreign = await request.post('/backend/graphql', {
    headers: { Origin: 'https://foreign.example' },
    data: { query: 'mutation{createGroup(name:"외부"){id}}' },
  });
  expect(foreign.status()).toBe(403);
  const oversized = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: { query: ' '.repeat(65 * 1024) },
  });
  expect(oversized.status()).toBe(413);
  const signup = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: {
      query:
        'mutation{registerWithPassword(loginId:"cache_cookie",password:"cache password for production 2026",nickname:"쿠키 회원"){id}}',
    },
  });
  const registration = await signup.json();
  expect(registration.errors).toBeUndefined();
  expect(
    signup
      .headersArray()
      .some((header) => header.name.toLowerCase() === 'set-cookie' && header.value.includes('HttpOnly')),
  ).toBe(true);
  const me = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: { query: '{me{id}}' },
  });
  expect((await me.json()).data.me.id).toBe(registration.data.registerWithPassword.id);
  const created = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: { query: 'mutation{createGroup(name:"스트림 검증"){id}}' },
  });
  const groupId: string = (await created.json()).data.createGroup.id;
  const ticketResponse = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: {
      query: 'mutation($group:ID!){requestPostUpload(groupId:$group){id}}',
      variables: { group: groupId },
    },
  });
  const uploadId: string = (await ticketResponse.json()).data.requestPostUpload.id;
  const multipart = new FormData();
  multipart.append(
    'operations',
    JSON.stringify({
      query: 'mutation($id:ID!,$file:Upload!){uploadPostMedia(uploadId:$id,file:$file)}',
      variables: { id: uploadId, file: null },
    }),
  );
  multipart.append('map', JSON.stringify({ '0': ['variables.file'] }));
  multipart.append(
    '0',
    new Blob([new Uint8Array(await createTestImage())], { type: 'image/png' }),
    'stream.png',
  );
  const media = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN, 'Apollo-Require-Preflight': 'true' },
    multipart,
  });
  expect(media.status(), await media.text()).toBe(200);
  expect((await media.json()).data.uploadPostMedia).toBe(true);
  const post = await request.post('/backend/graphql', {
    headers: { Origin: CACHE_WEB_ORIGIN },
    data: {
      query: CREATE_POST,
      variables: { group: groupId, upload: uploadId, title: '프록시 스트림 업로드' },
    },
  });
  expect((await post.json()).errors).toBeUndefined();
});
