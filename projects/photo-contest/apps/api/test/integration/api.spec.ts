import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '../../generated/prisma';
import sharp from 'sharp';
import type { INestApplication } from '@nestjs/common';
const require = createRequire(import.meta.url);
const db = new PrismaClient();
const schemaName = `contest_test_${randomUUID().replaceAll('-', '')}`;
let app: INestApplication;
let url: string;
let owner: string, friend: string, voter: string, outsider: string;
let groupId: string, contestId: string, inviteToken: string, photoId: string, friendPhotoId: string;
const origin = 'http://localhost:3200';
const directory = resolve('.data', schemaName);
async function login(nickname: string) {
  const response = await fetch(`${url}/auth/dev`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}
async function graphql(cookie: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(`${url}/graphql`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': 'application/json',
      'Apollo-Require-Preflight': 'true',
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}
async function submit(cookie: string, caption: string) {
  const ticket = await graphql(cookie, 'mutation($id: ID!) { requestUploadUrl(contestId: $id) { id url } }', {
    id: contestId,
  });
  expect(ticket.errors).toBeUndefined();
  const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#316447' } })
    .png()
    .toBuffer();
  const uploaded = await fetch(`${url}${ticket.data.requestUploadUrl.url.replace('/backend', '')}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'image/png' },
    body: image,
  });
  expect(uploaded.status).toBe(201);
  const result = await graphql(
    cookie,
    'mutation($id: ID!, $uploadId: ID!, $caption: String!) { createSubmission(contestId: $id, uploadId: $uploadId, caption: $caption, rightsConfirmed: true) { id imageUrl } }',
    { id: contestId, uploadId: ticket.data.requestUploadUrl.id, caption },
  );
  expect(result.errors).toBeUndefined();
  return result.data.createSubmission.id as string;
}
beforeAll(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL을 지정한 격리 가능한 개발 DB에서 실행해 주세요.');
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set('schema', schemaName);
  process.env.DATABASE_URL = connection.toString();
  const { execFileSync } = await import('node:child_process');
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { env: process.env },
  );
  process.env.NODE_ENV = 'development';
  process.env.ENABLE_DEV_LOGIN = 'true';
  process.env.WEB_ORIGIN = origin;
  process.env.STORAGE_DIR = directory;
  process.env.STORAGE_BACKEND = 'local';
  await mkdir(directory, { recursive: true });
  const { createApp } = require('../../dist/bootstrap.js') as {
    createApp: () => Promise<INestApplication>;
  };
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  owner = await login('관리자');
  friend = await login('친구');
  voter = await login('투표자');
  outsider = await login('외부인');
}, 60000);
afterAll(async () => {
  if (app) await app.close();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
function isolated() {
  const connection = new URL(process.env.DATABASE_URL!);
  return new PrismaClient({ datasourceUrl: connection.toString() });
}
describe.sequential('실제 API와 PostgreSQL', () => {
  it('그룹을 만들고 초대로 가입해야 한다', async () => {
    const result = await graphql(
      owner,
      'mutation { createGroup(name: "웃음 연구소") { id inviteToken role } }',
    );
    expect(result.errors).toBeUndefined();
    groupId = result.data.createGroup.id;
    inviteToken = result.data.createGroup.inviteToken;
    expect(result.data.createGroup.role).toBe('OWNER');
    for (const cookie of [friend, voter]) {
      const joined = await graphql(
        cookie,
        'mutation($token: String!) { joinGroup(token: $token) { id members { user { id } } } }',
        { token: inviteToken },
      );
      expect(joined.data.joinGroup.id).toBe(groupId);
    }
  });
  it('비회원의 그룹·대회 접근과 일반 멤버의 대회 생성을 거부해야 한다', async () => {
    const group = await graphql(outsider, 'query($id: ID!) { group(id: $id) { name } }', { id: groupId });
    expect(group.errors[0].extensions.code).toBe('FORBIDDEN');
    const now = Date.now();
    const variables = {
      groupId,
      startsAt: new Date(now).toISOString(),
      submissionEndsAt: new Date(now + 3600_000).toISOString(),
      endsAt: new Date(now + 7200_000).toISOString(),
    };
    const mutation =
      'mutation($groupId: ID!, $startsAt: DateTime!, $submissionEndsAt: DateTime!, $endsAt: DateTime!) { createContest(groupId: $groupId, title: "웃긴 순간", startsAt: $startsAt, submissionEndsAt: $submissionEndsAt, endsAt: $endsAt) { id phase } }';
    const denied = await graphql(friend, mutation, variables);
    expect(denied.errors[0].extensions.code).toBe('FORBIDDEN');
    const created = await graphql(owner, mutation, variables);
    expect(created.errors).toBeUndefined();
    expect(created.data.createContest.phase).toBe('SUBMISSION');
    contestId = created.data.createContest.id;
    const contest = await graphql(outsider, 'query($id: ID!) { contest(id: $id) { title } }', {
      id: contestId,
    });
    expect(contest.errors[0].extensions.code).toBe('FORBIDDEN');
  });
  it('사진을 변환하고 그룹 멤버에게만 제공해야 한다', async () => {
    photoId = await submit(owner, '관리자의 사진');
    friendPhotoId = await submit(friend, '친구의 사진');
    const denied = await fetch(`${url}/photos/${photoId}`, { headers: { Cookie: outsider } });
    expect(denied.status).toBe(403);
    const anonymous = await fetch(`${url}/photos/${photoId}`);
    expect(anonymous.status).toBe(401);
    const allowed = await fetch(`${url}/photos/${photoId}`, { headers: { Cookie: friend } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('cache-control')).toBe('private, no-store');
    const metadata = await sharp(Buffer.from(await allowed.arrayBuffer())).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
  });
  it('중복 제출과 거짓 이미지 파일을 거부해야 한다', async () => {
    const ticket = await graphql(
      owner,
      'mutation($id: ID!) { requestUploadUrl(contestId: $id) { id url } }',
      { id: contestId },
    );
    const invalid = await fetch(`${url}${ticket.data.requestUploadUrl.url.replace('/backend', '')}`, {
      method: 'POST',
      headers: { Cookie: owner, Origin: origin, 'Content-Type': 'image/png' },
      body: Buffer.from('not an image'),
    });
    expect(invalid.status).toBe(400);
    const client = isolated();
    try {
      const original = await client.submission.findUniqueOrThrow({ where: { id: photoId } });
      const duplicate = await graphql(
        owner,
        'mutation($id: ID!, $upload: ID!) { createSubmission(contestId: $id, uploadId: $upload, caption: "중복", rightsConfirmed: true) { id } }',
        { id: contestId, upload: original.uploadId },
      );
      expect(duplicate.errors[0].extensions.code).toBe('CONFLICT');
    } finally {
      await client.$disconnect();
    }
  });
  it('제출 기간에는 투표와 결과·득표수를 공개하지 않아야 한다', async () => {
    const denied = await graphql(
      voter,
      'mutation($id: ID!, $photo: ID!) { castVote(contestId: $id, submissionId: $photo) { id } }',
      { id: contestId, photo: photoId },
    );
    expect(denied.errors).toBeDefined();
    const result = await graphql(
      friend,
      'query($id: ID!) { contest(id: $id) { submissions { voteCount reportCount } } contestResults(contestId: $id) { voteCount } }',
      { id: contestId },
    );
    expect(result.errors).toBeDefined();
    const visible = await graphql(
      friend,
      'query($id: ID!) { contest(id: $id) { submissions { voteCount reportCount } } }',
      { id: contestId },
    );
    expect(
      visible.data.contest.submissions.every(
        (s: { voteCount: unknown; reportCount: unknown }) => s.voteCount === null && s.reportCount === null,
      ),
    ).toBe(true);
  });
  it('동시 투표는 정확히 한 요청만 성공하고 자기 사진은 거부해야 한다', async () => {
    const client = isolated();
    try {
      await client.contest.update({
        where: { id: contestId },
        data: { submissionEndsAt: new Date(Date.now() - 1000) },
      });
    } finally {
      await client.$disconnect();
    }
    const query = 'mutation($id: ID!, $photo: ID!) { castVote(contestId: $id, submissionId: $photo) { id } }';
    const self = await graphql(owner, query, { id: contestId, photo: photoId });
    expect(self.errors[0].message).toContain('자신의 사진');
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => graphql(voter, query, { id: contestId, photo: photoId })),
    );
    expect(attempts.filter((a) => a.data?.castVote)).toHaveLength(1);
    expect(attempts.filter((a) => a.errors)).toHaveLength(7);
    const check = isolated();
    try {
      expect(await check.vote.count({ where: { contestId } })).toBe(1);
      expect(await check.analyticsEvent.count({ where: { type: 'vote_cast' } })).toBe(1);
    } finally {
      await check.$disconnect();
    }
    const other = await graphql(owner, query, { id: contestId, photo: friendPhotoId });
    expect(other.errors).toBeUndefined();
  });
  it('투표 마감 후 공동 우승을 반환하고 늦은 투표를 거부해야 한다', async () => {
    const client = isolated();
    try {
      await client.contest.update({
        where: { id: contestId },
        data: { endsAt: new Date(Date.now() - 1000) },
      });
    } finally {
      await client.$disconnect();
    }
    const results = await graphql(
      friend,
      'query($id: ID!) { contestResults(contestId: $id) { winner voteCount } }',
      { id: contestId },
    );
    expect(results.errors).toBeUndefined();
    expect(results.data.contestResults).toEqual([
      { winner: true, voteCount: 1 },
      { winner: true, voteCount: 1 },
    ]);
    const late = await graphql(
      friend,
      'mutation($id: ID!, $photo: ID!) { castVote(contestId: $id, submissionId: $photo) { id } }',
      { id: contestId, photo: photoId },
    );
    expect(late.errors).toBeDefined();
  });
  it('신고는 중복되지 않고 관리자만 숨김·삭제할 수 있어야 한다', async () => {
    const report = 'mutation($id: ID!) { reportSubmission(submissionId: $id, reason: "동의하지 않은 사진") }';
    await graphql(friend, report, { id: photoId });
    await graphql(friend, report, { id: photoId });
    const adminReports = await graphql(
      owner,
      'query($id: ID!) { contestResults(contestId: $id) { submission { id reportCount reports { reason } } } }',
      { id: contestId },
    );
    const reportedPhoto = adminReports.data.contestResults.find(
      (result: { submission: { id: string } }) => result.submission.id === photoId,
    );
    expect(reportedPhoto.submission.reportCount).toBe(1);
    expect(reportedPhoto.submission.reports[0].reason).toBe('동의하지 않은 사진');
    const memberPrivacy = await graphql(
      friend,
      'query($id: ID!) { contestResults(contestId: $id) { submission { reports { reason } } } }',
      { id: contestId },
    );
    expect(
      memberPrivacy.data.contestResults.every(
        (result: { submission: { reports: unknown } }) => result.submission.reports === null,
      ),
    ).toBe(true);
    const denied = await graphql(friend, 'mutation($id: ID!) { hideSubmission(submissionId: $id) }', {
      id: photoId,
    });
    expect(denied.errors[0].extensions.code).toBe('FORBIDDEN');
    const hidden = await graphql(owner, 'mutation($id: ID!) { hideSubmission(submissionId: $id) }', {
      id: photoId,
    });
    expect(hidden.data.hideSubmission).toBe(true);
    const photo = await fetch(`${url}/photos/${photoId}`, { headers: { Cookie: friend } });
    expect(photo.status).toBe(404);
    const results = await graphql(
      friend,
      'query($id: ID!) { contestResults(contestId: $id) { submission { id } } }',
      { id: contestId },
    );
    expect(results.data.contestResults).toHaveLength(1);
    const removed = await graphql(owner, 'mutation($id: ID!) { deleteSubmission(submissionId: $id) }', {
      id: photoId,
    });
    expect(removed.errors).toBeUndefined();
    expect(removed.data.deleteSubmission).toBe(true);
  });
  it('다른 출처의 요청과 운영 모드 개발 로그인을 거부해야 한다', async () => {
    const csrf = await fetch(`${url}/auth/dev`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: '외부' }),
    });
    expect(csrf.status).toBe(403);
    process.env.NODE_ENV = 'production';
    try {
      const response = await fetch(`${url}/auth/dev`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '운영 접근' }),
      });
      expect(response.status).toBe(403);
    } finally {
      process.env.NODE_ENV = 'development';
    }
  });
});

describe.sequential('OAuth와 세션 경계', () => {
  it('다른 브라우저의 state와 재사용 callback을 거부해야 한다', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    const start = await fetch(`${url}/auth/google`, { redirect: 'manual' });
    expect(start.status).toBe(302);
    const authorize = new URL(start.headers.get('location')!);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const state = authorize.searchParams.get('state')!;
    const rejected = await fetch(`${url}/auth/google/callback?state=${state}&code=invalid`, {
      redirect: 'manual',
    });
    expect(rejected.headers.get('location')).toContain('loginError=1');
    const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
    const client = isolated();
    try {
      const attempt = await client.oAuthAttempt.findFirstOrThrow({ where: { provider: 'google' } });
      const { createHash } = await import('node:crypto');
      expect(authorize.searchParams.get('code_challenge')).toBe(
        createHash('sha256').update(attempt.verifier).digest('base64url'),
      );
      await client.oAuthAttempt.update({
        where: { stateHash: attempt.stateHash },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await fetch(`${url}/auth/google/callback?state=${state}&code=invalid`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(expired.headers.get('location')).toContain('loginError=1');
    } finally {
      await client.$disconnect();
    }
  });
  it('provider 토큰 경계에서 PKCE verifier를 보내고 해시 세션만 저장해야 한다', async () => {
    const originalFetch = globalThis.fetch;
    const start = await originalFetch(`${url}/auth/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
    let verifier = '';
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
      if (String(input) === 'https://oauth2.googleapis.com/token') {
        verifier = String((options?.body as URLSearchParams).get('code_verifier'));
        return new Response(JSON.stringify({ access_token: 'mock-provider-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(input) === 'https://openidconnect.googleapis.com/v1/userinfo')
        return new Response(
          JSON.stringify({ sub: 'google-user-1', name: '소셜 친구', email: 'same@example.com' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      return originalFetch(input, options);
    });
    try {
      const response = await originalFetch(`${url}/auth/google/callback?state=${state}&code=mock-code`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(response.headers.get('location')).toBe(`${origin}/`);
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      const rawCookie = response.headers.getSetCookie().find((c) => c.startsWith('contest_session='))!;
      expect(rawCookie).toContain('HttpOnly');
      expect(rawCookie).toContain('SameSite=Lax');
      const rawToken = rawCookie.split(';')[0]!.split('=')[1]!;
      const client = isolated();
      try {
        expect(await client.session.findUnique({ where: { tokenHash: rawToken } })).toBeNull();
        const { createHash } = await import('node:crypto');
        expect(
          await client.session.findUnique({
            where: { tokenHash: createHash('sha256').update(rawToken).digest('hex') },
          }),
        ).not.toBeNull();
      } finally {
        await client.$disconnect();
      }
      const reused = await originalFetch(`${url}/auth/google/callback?state=${state}&code=mock-code`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(reused.headers.get('location')).toContain('loginError=1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('로그아웃 이후 기존 세션은 사용할 수 없어야 한다', async () => {
    const cookie = await login('로그아웃 테스트');
    const before = await graphql(cookie, '{ me { nickname } }');
    expect(before.data.me.nickname).toBe('로그아웃 테스트');
    const logout = await fetch(`${url}/auth/logout`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie },
    });
    expect(logout.status).toBe(200);
    const after = await graphql(cookie, '{ me { id } }');
    expect(after.data.me).toBeNull();
  });
});

describe.sequential('제품 관측과 정리', () => {
  it('무투표 대회는 0표 사진을 보여주되 우승자를 만들지 않아야 한다', async () => {
    const client = isolated();
    try {
      const me = await graphql(owner, '{ me { id } }');
      const now = Date.now();
      const empty = await client.contest.create({
        data: {
          groupId,
          title: '무투표 대회',
          startsAt: new Date(now - 3000),
          submissionEndsAt: new Date(now - 2000),
          endsAt: new Date(now - 1000),
        },
      });
      const upload = await client.upload.create({
        data: {
          userId: me.data.me.id,
          contestId: empty.id,
          tokenHash: randomUUID(),
          expiresAt: new Date(now + 60000),
          imageKey: `${randomUUID()}.webp`,
        },
      });
      await client.submission.create({
        data: {
          authorId: me.data.me.id,
          contestId: empty.id,
          uploadId: upload.id,
          caption: '표가 없는 사진',
        },
      });
      const result = await graphql(
        owner,
        'query($id: ID!) { contestResults(contestId: $id) { voteCount winner } }',
        { id: empty.id },
      );
      expect(result.data.contestResults).toEqual([{ voteCount: 0, winner: false }]);
    } finally {
      await client.$disconnect();
    }
  });
  it('종료 이벤트를 한 번 기록하고 전송 실패 시 outbox를 재시도해야 한다', async () => {
    const { AnalyticsService } = require('../../dist/analytics.js');
    const service = app.get<{ flush: () => Promise<void> }>(AnalyticsService);
    await service.flush();
    await service.flush();
    const client = isolated();
    const originalFetch = globalThis.fetch;
    const batches: Array<{
      events: Array<{ insert_id: string; event_type: string; event_properties: Record<string, unknown> }>;
    }> = [];
    let reject = true;
    process.env.AMPLITUDE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
      if (String(input) === 'https://api2.amplitude.com/2/httpapi') {
        batches.push(JSON.parse(String(options?.body)));
        return new Response('{}', { status: reject ? 503 : 200 });
      }
      return originalFetch(input, options);
    });
    try {
      expect(await client.analyticsEvent.count({ where: { id: `completed:${contestId}` } })).toBe(1);
      await expect(service.flush()).rejects.toThrow('503');
      expect(await client.analyticsEvent.count({ where: { deliveredAt: { not: null } } })).toBe(0);
      reject = false;
      await service.flush();
      expect(batches[0]?.events.map((e) => e.insert_id)).toEqual(batches[1]?.events.map((e) => e.insert_id));
      expect(await client.analyticsEvent.count({ where: { deliveredAt: null } })).toBe(0);
      expect(JSON.stringify(batches)).not.toContain('웃음 연구소');
      expect(JSON.stringify(batches)).not.toContain('표가 없는 사진');
      expect(JSON.stringify(batches)).not.toContain('동의하지 않은 사진');
    } finally {
      delete process.env.AMPLITUDE_API_KEY;
      vi.unstubAllGlobals();
      await client.$disconnect();
    }
  });
});
