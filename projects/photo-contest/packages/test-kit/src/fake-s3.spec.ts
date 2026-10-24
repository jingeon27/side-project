import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FAKE_S3_DEFAULTS, startFakeS3, type IFakeS3 } from './fake-s3';

const ORIGIN = 'http://localhost:3999';
const KEY = 'prefix/11111111-2222-3333-4444-555555555555.png';
let directory: string;
let s3: IFakeS3;
let client: S3Client;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fake-s3-'));
  s3 = await startFakeS3({ ...FAKE_S3_DEFAULTS, directory, corsOrigins: [ORIGIN] });
  client = new S3Client({
    region: FAKE_S3_DEFAULTS.region,
    endpoint: s3.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: FAKE_S3_DEFAULTS.accessKeyId,
      secretAccessKey: FAKE_S3_DEFAULTS.secretAccessKey,
    },
  });
});
afterAll(async () => {
  client.destroy();
  await s3.stop();
  await rm(directory, { recursive: true, force: true });
});
afterEach(() => vi.useRealTimers());

async function presignedPost(key: string, body: Uint8Array, contentType = 'image/png', expires = 60) {
  return createPresignedPost(client, {
    Bucket: s3.bucket,
    Key: key,
    Expires: expires,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', body.byteLength, body.byteLength],
      ['eq', '$Content-Type', contentType],
    ],
  });
}

function postForm(
  { url, fields }: { url: string; fields: Record<string, string> },
  body: Uint8Array,
  overrides: Record<string, string> = {},
) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...fields, ...overrides })) form.append(name, value);
  form.append('file', new Blob([new Uint8Array(body)], { type: 'image/png' }), 'photo.png');
  return fetch(url, { method: 'POST', body: form, headers: { Origin: ORIGIN } });
}

describe('S3 대역 서명 POST', () => {
  it('정책이 고정한 키·형식·정확한 크기의 파일만 저장하고 HEAD로 확인할 수 있어야 한다', async () => {
    const body = new TextEncoder().encode('png-bytes');
    const form = await presignedPost(KEY, body);
    const response = await postForm(form, body);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const head = await client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: KEY }));
    expect(head).toMatchObject({ ContentLength: body.byteLength, ContentType: 'image/png' });
  });

  it('정책을 바꾸거나 다른 크기·형식·키·추가 필드를 보내면 저장하지 않아야 한다', async () => {
    const body = new TextEncoder().encode('exact-size');
    const key = 'prefix/22222222-2222-3333-4444-555555555555.png';
    const form = await presignedPost(key, body);
    const policy = JSON.parse(Buffer.from(form.fields.Policy ?? '', 'base64').toString());
    policy.conditions = policy.conditions.map((condition: unknown) =>
      Array.isArray(condition) && condition[0] === 'content-length-range'
        ? ['content-length-range', 0, 10_000_000]
        : condition,
    );
    const tampered = Buffer.from(JSON.stringify(policy)).toString('base64');
    expect((await postForm(form, body, { Policy: tampered })).status).toBe(403);
    expect((await postForm(form, new TextEncoder().encode('longer-than-signed'))).status).toBe(400);
    expect((await postForm(form, body, { 'Content-Type': 'text/html' })).status).toBe(403);
    expect((await postForm(form, body, { key: 'prefix/other.png' })).status).toBe(403);
    expect((await postForm(form, body, { 'x-amz-meta-owner': 'attacker' })).status).toBe(403);
    await expect(client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key }))).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
  });

  it('만료된 정책과 다른 자격 증명으로 서명한 정책을 거부해야 한다', async () => {
    const body = new TextEncoder().encode('late');
    const form = await presignedPost('prefix/33333333-2222-3333-4444-555555555555.png', body, 'image/png', 1);
    vi.useFakeTimers({ now: Date.now() + 5_000, toFake: ['Date'] });
    expect((await postForm(form, body)).status).toBe(403);
    vi.useRealTimers();
    const stranger = new S3Client({
      region: FAKE_S3_DEFAULTS.region,
      endpoint: s3.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: FAKE_S3_DEFAULTS.accessKeyId, secretAccessKey: 'wrong-secret' },
    });
    const forged = await createPresignedPost(stranger, { Bucket: s3.bucket, Key: 'prefix/forged.png' });
    expect((await postForm(forged, body)).status).toBe(403);
    stranger.destroy();
  });
});

describe('S3 대역 서명 GET', () => {
  it('서명한 주소만 Range·다운로드 이름·캐시 헤더를 반영해 읽고 변조·만료·익명 요청은 거부해야 한다', async () => {
    const key = 'prefix/44444444-2222-3333-4444-555555555555.mp4';
    const bytes = new TextEncoder().encode('0123456789');
    await client.send(
      new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: bytes, ContentType: 'video/mp4' }),
    );
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        ResponseCacheControl: 'private, no-store',
        ResponseContentDisposition: "attachment; filename*=UTF-8''%EC%98%81%EC%83%81.mp4",
      }),
      { expiresIn: 60 },
    );
    const full = await fetch(url);
    expect(full.status).toBe(200);
    expect(full.headers.get('cache-control')).toBe('private, no-store');
    expect(full.headers.get('content-disposition')).toContain('attachment');
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect(await full.text()).toBe('0123456789');
    const partial = await fetch(url, { headers: { Range: 'bytes=2-5' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await partial.text()).toBe('2345');
    expect((await fetch(url, { headers: { Range: 'bytes=20-30' } })).status).toBe(416);
    expect((await fetch(url.replace('44444444', '55555555'))).status).toBe(403);
    expect((await fetch(`${s3.endpoint}/${s3.bucket}/${key}`)).status).toBe(403);
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] });
    expect((await fetch(url)).status).toBe(403);
  });

  it('삭제한 객체는 HEAD에서 찾을 수 없고 키로 저장 폴더 밖을 가리킬 수 없어야 한다', async () => {
    const key = 'prefix/66666666-2222-3333-4444-555555555555.webp';
    await client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: new Uint8Array([1, 2, 3]) }));
    await client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
    await expect(client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key }))).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
    await expect(
      client.send(
        new PutObjectCommand({ Bucket: s3.bucket, Key: '../escape.png', Body: new Uint8Array([1]) }),
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: expect.any(Number) } });
  });
});

describe('S3 대역 CORS', () => {
  it('허용한 웹 origin의 사전 요청만 허락해야 한다', async () => {
    const preflight = (origin: string) =>
      fetch(`${s3.endpoint}/${s3.bucket}`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });
    const allowed = await preflight(ORIGIN);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const denied = await preflight('https://evil.example');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});
