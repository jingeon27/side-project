// 이 파일은 node: 모듈만 쓴다. 컨테이너 검증에서 Node의 타입 제거만으로 바로 실행한다.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

export interface IFakeS3Options {
  /** 객체를 저장할 폴더. 버킷 이름의 하위 폴더에 키 경로 그대로 쓴다. */
  directory: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 브라우저의 직접 업로드·조회를 허용할 origin */
  corsOrigins: readonly string[];
  /** 0이면 비어 있는 포트를 고른다. */
  port?: number;
  host?: string;
}

export interface IFakeS3 {
  /** 예: http://127.0.0.1:43123 (path-style) */
  endpoint: string;
  port: number;
  bucket: string;
  /** API에 넘길 S3 설정 */
  env: Record<string, string>;
  stop: () => Promise<void>;
}

interface IObjectMeta {
  contentType: string;
  size: number;
  etag: string;
  lastModified: string;
}

interface IFormFile {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

interface IFormEntries {
  forEach: (callback: (value: string | IFormFile, name: string) => void) => void;
}

interface IStoredObject {
  body: Buffer;
  contentType: string;
}

/** 테스트 레인이 함께 쓰는 가짜 자격 증명. 실제 AWS로 나가지 않는다. */
export const FAKE_S3_DEFAULTS = {
  bucket: 'photo-contest-test',
  region: 'us-east-1',
  accessKeyId: 'photo-contest-test',
  secretAccessKey: 'photo-contest-test-secret',
} as const;

const ALGORITHM = 'AWS4-HMAC-SHA256';
const MAX_BODY_BYTES = 128 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;
const CORS_METHODS = ['GET', 'HEAD', 'POST'];
const EXPOSED_HEADERS =
  'ETag, Content-Length, Content-Range, Content-Type, Content-Disposition, Accept-Ranges';
const SAFE_KEY = /^[A-Za-z0-9!_.*'()-]+(?:\/[A-Za-z0-9!_.*'()-]+)*$/;
const RESPONSE_OVERRIDES = {
  'response-content-type': 'Content-Type',
  'response-content-disposition': 'Content-Disposition',
  'response-cache-control': 'Cache-Control',
  'response-content-language': 'Content-Language',
  'response-content-encoding': 'Content-Encoding',
  'response-expires': 'Expires',
} as const;
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

class S3Error extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();

/** RFC 3986 방식. SigV4 정규 요청과 같은 규칙으로 다시 인코딩한다. */
function escapeUri(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function parseAmzDate(value: string) {
  const matched = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!matched) throw new S3Error(403, 'AccessDenied', 'X-Amz-Date 형식이 올바르지 않습니다.');
  const [, year, month, day, hour, minute, second] = matched.map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour, minute, second);
}

function sameSignature(actual: string, expected: string) {
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function queryPairs(search: string) {
  return search
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      const name = decodeURIComponent(index < 0 ? part : part.slice(0, index));
      const value = index < 0 ? '' : decodeURIComponent(part.slice(index + 1));
      return [name, value] as const;
    });
}

function headerValue(req: IncomingMessage, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value.join(',') : value;
}

function xmlEscape(value: string) {
  return value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function decodeAwsChunked(body: Buffer) {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf('\r\n', offset);
    if (lineEnd < 0) throw new S3Error(400, 'IncompleteBody', 'aws-chunked 본문이 끝나지 않았습니다.');
    const size = Number.parseInt(body.subarray(offset, lineEnd).toString('ascii').split(';')[0] ?? '', 16);
    if (!Number.isSafeInteger(size))
      throw new S3Error(400, 'InvalidRequest', 'aws-chunked 크기를 읽을 수 없습니다.');
    if (size === 0) return Buffer.concat(chunks);
    chunks.push(body.subarray(lineEnd + 2, lineEnd + 2 + size));
    offset = lineEnd + 2 + size + 2;
  }
  return Buffer.concat(chunks);
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new S3Error(400, 'EntityTooLarge', '본문이 너무 큽니다.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/**
 * 로컬 개발·테스트 전용 S3 호환 서버. 앱이 쓰는 기능만 구현한다:
 * 서명 POST(정책 검증), 서명 GET·HEAD(Range·응답 헤더 덮어쓰기), 헤더 서명 HEAD·PUT·DELETE, 브라우저 CORS.
 * 임시 대역이며 장기적으로는 MinIO 같은 실제 S3 호환 서버로 바꾼다.
 */
export async function startFakeS3(options: IFakeS3Options): Promise<IFakeS3> {
  const root = resolve(options.directory);
  const bucketRoot = join(root, options.bucket);
  const metadataRoot = join(root, '.metadata', options.bucket);
  const temporaryRoot = join(root, '.tmp');
  await mkdir(bucketRoot, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });

  const signingKey = (date: string) =>
    hmac(hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, date), options.region), 's3'), 'aws4_request');

  const objectPaths = (key: string) => {
    if (key.length > 1024 || !SAFE_KEY.test(key) || key.split('/').some((part) => /^\.+$/.test(part)))
      throw new S3Error(400, 'InvalidArgument', '지원하지 않는 객체 키입니다.');
    const object = resolve(bucketRoot, ...key.split('/'));
    if (!object.startsWith(`${bucketRoot}${sep}`))
      throw new S3Error(400, 'InvalidArgument', '지원하지 않는 객체 키입니다.');
    return { object, metadata: `${resolve(metadataRoot, ...key.split('/'))}.json` };
  };

  const readMeta = async (key: string): Promise<IObjectMeta | null> => {
    const paths = objectPaths(key);
    try {
      const file = await stat(paths.object);
      if (!file.isFile()) return null;
      const stored = await readFile(paths.metadata, 'utf8')
        .then((text): Partial<IObjectMeta> => JSON.parse(text))
        .catch((): Partial<IObjectMeta> => ({}));
      return {
        contentType:
          stored.contentType ?? EXTENSION_TYPES[key.split('.').at(-1) ?? ''] ?? 'binary/octet-stream',
        size: file.size,
        etag: stored.etag ?? `"${createHash('md5').update(key).digest('hex')}"`,
        lastModified: stored.lastModified ?? file.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  };

  const writeObject = async (key: string, { body, contentType }: IStoredObject) => {
    const paths = objectPaths(key);
    const meta: IObjectMeta = {
      contentType,
      size: body.length,
      etag: `"${createHash('md5').update(body).digest('hex')}"`,
      lastModified: new Date().toISOString(),
    };
    const temporary = join(temporaryRoot, randomUUID());
    await writeFile(temporary, body, { mode: 0o600 });
    await mkdir(dirname(paths.object), { recursive: true });
    await rename(temporary, paths.object);
    await mkdir(dirname(paths.metadata), { recursive: true });
    await writeFile(paths.metadata, JSON.stringify(meta), { mode: 0o600 });
    return meta;
  };

  const assertCredential = (credential: string, amzDate: string) => {
    const [accessKeyId, date, region, service, terminator, ...rest] = credential.split('/');
    if (accessKeyId !== options.accessKeyId)
      throw new S3Error(403, 'InvalidAccessKeyId', '알 수 없는 access key입니다.');
    if (
      rest.length ||
      date !== amzDate.slice(0, 8) ||
      region !== options.region ||
      service !== 's3' ||
      terminator !== 'aws4_request'
    )
      throw new S3Error(403, 'AuthorizationQueryParametersError', '서명 범위가 올바르지 않습니다.');
    return { date, scope: `${date}/${region}/s3/aws4_request` };
  };

  /** 헤더 서명과 presigned query 서명을 같은 SigV4 정규 요청으로 검사한다. */
  const verifyRequest = (req: IncomingMessage, rawPath: string, search: string) => {
    const pairs = queryPairs(search);
    const query = new Map(pairs);
    const authorization = headerValue(req, 'authorization');
    const now = Date.now();
    const presigned = !authorization && query.has('X-Amz-Signature');
    if (!authorization && !presigned) throw new S3Error(403, 'AccessDenied', '서명이 필요합니다.');
    const parsed = authorization
      ? /^AWS4-HMAC-SHA256 Credential=([^,\s]+),\s*SignedHeaders=([^,\s]+),\s*Signature=([a-f0-9]{64})$/.exec(
          authorization,
        )
      : null;
    if (authorization && !parsed)
      throw new S3Error(400, 'InvalidRequest', '지원하지 않는 Authorization입니다.');
    if (presigned && query.get('X-Amz-Algorithm') !== ALGORITHM)
      throw new S3Error(400, 'AuthorizationQueryParametersError', '지원하지 않는 서명 방식입니다.');
    const credential = parsed?.[1] ?? query.get('X-Amz-Credential') ?? '';
    const signedHeaders = parsed?.[2] ?? query.get('X-Amz-SignedHeaders') ?? '';
    const signature = parsed?.[3] ?? query.get('X-Amz-Signature') ?? '';
    const amzDate = (presigned ? query.get('X-Amz-Date') : headerValue(req, 'x-amz-date')) ?? '';
    const signedAt = parseAmzDate(amzDate);
    if (signedAt - now > MAX_CLOCK_SKEW_MS)
      throw new S3Error(403, 'RequestTimeTooSkewed', '요청 시각이 너무 늦습니다.');
    if (presigned) {
      const expires = Number(query.get('X-Amz-Expires'));
      if (!Number.isSafeInteger(expires) || expires <= 0 || expires > MAX_PRESIGN_SECONDS)
        throw new S3Error(400, 'AuthorizationQueryParametersError', 'X-Amz-Expires가 올바르지 않습니다.');
      if (signedAt + expires * 1000 < now) throw new S3Error(403, 'AccessDenied', 'Request has expired');
    }
    if (!presigned && now - signedAt > MAX_CLOCK_SKEW_MS)
      throw new S3Error(403, 'RequestTimeTooSkewed', '요청 시각이 너무 이릅니다.');
    const { date, scope } = assertCredential(credential, amzDate);
    const names = signedHeaders.split(';');
    if (!names.includes('host')) throw new S3Error(403, 'AccessDenied', 'host 헤더 서명이 필요합니다.');
    const canonicalHeaders = names
      .map((name) => {
        const value = headerValue(req, name);
        if (value === undefined) throw new S3Error(403, 'SignatureDoesNotMatch', `${name} 헤더가 없습니다.`);
        return `${name}:${value.trim().replace(/\s+/g, ' ')}\n`;
      })
      .join('');
    const canonicalQuery = pairs
      .filter(([name]) => name.toLowerCase() !== 'x-amz-signature')
      .map(([name, value]) => [escapeUri(name), escapeUri(value)] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, value]) => `${name}=${value}`)
      .join('&');
    const payloadHash =
      (presigned ? query.get('X-Amz-Content-Sha256') : headerValue(req, 'x-amz-content-sha256')) ??
      'UNSIGNED-PAYLOAD';
    const canonicalRequest = [
      req.method ?? 'GET',
      rawPath,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
    const expected = hmac(signingKey(date), stringToSign).toString('hex');
    if (!sameSignature(signature, expected))
      throw new S3Error(403, 'SignatureDoesNotMatch', '서명이 일치하지 않습니다.');
    return query;
  };

  /** 브라우저 POST 정책: 서명, 만료, 모든 조건과 정책 밖의 필드, 파일 크기를 S3처럼 검사한다. */
  const postObject = async (req: IncomingMessage, res: ServerResponse) => {
    const length = Number(headerValue(req, 'content-length'));
    if (!Number.isSafeInteger(length))
      throw new S3Error(411, 'MissingContentLength', '본문 길이가 필요합니다.');
    if (length > MAX_BODY_BYTES) throw new S3Error(400, 'EntityTooLarge', '본문이 너무 큽니다.');
    const contentType = headerValue(req, 'content-type') ?? '';
    if (!contentType.startsWith('multipart/form-data'))
      throw new S3Error(412, 'PreconditionFailed', 'multipart/form-data가 필요합니다.');
    // Node fetch는 스트림 본문에 duplex를 요구하지만 DOM 타입에는 아직 없다.
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: 'half',
    };
    const form = await new Request('http://fake-s3.invalid/', init).formData().catch(() => {
      throw new S3Error(400, 'MalformedPOSTRequest', 'multipart 본문을 읽을 수 없습니다.');
    });
    const fields = new Map<string, string>();
    let file: IFormFile | undefined;
    // 앱마다 다른 DOM 타입 설정(React Native 포함)에서도 같은 순서로 읽도록 forEach로 꺼낸다.
    const entries: Array<[string, string | IFormFile]> = [];
    (form as unknown as IFormEntries).forEach((value, name) => entries.push([name, value]));
    for (const [name, value] of entries) {
      const lower = name.toLowerCase();
      if (lower === 'file') {
        if (typeof value === 'string')
          throw new S3Error(400, 'InvalidArgument', 'file 필드는 파일이어야 합니다.');
        file = value;
        // S3는 file 뒤의 필드를 무시한다.
        break;
      }
      if (typeof value !== 'string' || fields.has(lower))
        throw new S3Error(400, 'InvalidArgument', `${name} 필드가 올바르지 않습니다.`);
      fields.set(lower, value);
    }
    const policy = fields.get('policy');
    const signature = fields.get('x-amz-signature');
    const credential = fields.get('x-amz-credential');
    const amzDate = fields.get('x-amz-date');
    if (!policy || !signature || !credential || !amzDate)
      throw new S3Error(403, 'AccessDenied', '서명 POST 정책 필드가 없습니다.');
    if (fields.get('x-amz-algorithm') !== ALGORITHM)
      throw new S3Error(400, 'InvalidArgument', '지원하지 않는 서명 방식입니다.');
    const { date } = assertCredential(credential, amzDate);
    if (!sameSignature(signature, hmac(signingKey(date), policy).toString('hex')))
      throw new S3Error(403, 'SignatureDoesNotMatch', '정책 서명이 일치하지 않습니다.');
    let document: { expiration?: unknown; conditions?: unknown };
    try {
      document = JSON.parse(Buffer.from(policy, 'base64').toString('utf8'));
    } catch {
      throw new S3Error(400, 'InvalidPolicyDocument', '정책을 읽을 수 없습니다.');
    }
    if (typeof document.expiration !== 'string' || !(Date.parse(document.expiration) > Date.now()))
      throw new S3Error(403, 'AccessDenied', 'Invalid according to Policy: Policy expired.');
    if (!Array.isArray(document.conditions))
      throw new S3Error(400, 'InvalidPolicyDocument', '정책 조건이 없습니다.');
    const covered = new Set<string>();
    let lengthRange: [number, number] | undefined;
    const fieldValue = (name: string) =>
      name === 'bucket' ? (fields.get('bucket') ?? options.bucket) : (fields.get(name) ?? '');
    const failed = (condition: unknown) =>
      new S3Error(403, 'AccessDenied', `Invalid according to Policy: ${JSON.stringify(condition)}`);
    for (const condition of document.conditions) {
      if (Array.isArray(condition)) {
        const [operator, target, expected] = condition;
        if (operator === 'content-length-range') {
          lengthRange = [Number(target), Number(expected)];
          continue;
        }
        const name = String(target).replace(/^\$/, '').toLowerCase();
        covered.add(name);
        const actual = fieldValue(name);
        if (operator === 'eq' && actual === expected) continue;
        if (operator === 'starts-with' && typeof expected === 'string' && actual.startsWith(expected))
          continue;
        throw failed(condition);
      }
      if (typeof condition !== 'object' || condition === null) throw failed(condition);
      for (const [name, expected] of Object.entries(condition)) {
        covered.add(name.toLowerCase());
        if (fieldValue(name.toLowerCase()) !== expected) throw failed(condition);
      }
    }
    if (fields.has('bucket') && fields.get('bucket') !== options.bucket)
      throw failed({ bucket: fields.get('bucket') });
    for (const name of fields.keys()) {
      if (['policy', 'x-amz-signature'].includes(name) || name.startsWith('x-ignore-')) continue;
      if (!covered.has(name))
        throw new S3Error(403, 'AccessDenied', `Invalid according to Policy: Extra input fields: ${name}`);
    }
    if (!file)
      throw new S3Error(400, 'InvalidArgument', 'POST requires exactly one file upload per request.');
    if (lengthRange && file.size < lengthRange[0])
      throw new S3Error(
        400,
        'EntityTooSmall',
        'Your proposed upload is smaller than the minimum allowed size',
      );
    if (lengthRange && file.size > lengthRange[1])
      throw new S3Error(400, 'EntityTooLarge', 'Your proposed upload exceeds the maximum allowed size');
    const key = (fields.get('key') ?? '').replaceAll('${filename}', file.name);
    const meta = await writeObject(key, {
      body: Buffer.from(await file.arrayBuffer()),
      contentType: fields.get('content-type') ?? 'binary/octet-stream',
    });
    const location = `http://${headerValue(req, 'host')}/${options.bucket}/${key.split('/').map(escapeUri).join('/')}`;
    const status = Number(fields.get('success_action_status'));
    if (status === 201) {
      res
        .writeHead(201, { 'Content-Type': 'application/xml', ETag: meta.etag, Location: location })
        .end(
          `<?xml version="1.0" encoding="UTF-8"?><PostResponse><Location>${xmlEscape(location)}</Location><Bucket>${options.bucket}</Bucket><Key>${xmlEscape(key)}</Key><ETag>${meta.etag}</ETag></PostResponse>`,
        );
      return;
    }
    res.writeHead(status === 200 ? 200 : 204, { ETag: meta.etag, Location: location }).end();
  };

  const getObject = async (
    req: IncomingMessage,
    res: ServerResponse,
    key: string,
    query: Map<string, string>,
  ) => {
    const meta = await readMeta(key);
    if (!meta) throw new S3Error(404, 'NoSuchKey', 'The specified key does not exist.');
    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': meta.contentType,
      ETag: meta.etag,
      'Last-Modified': new Date(meta.lastModified).toUTCString(),
    };
    for (const [name, header] of Object.entries(RESPONSE_OVERRIDES)) {
      const value = query.get(name);
      if (value) headers[header] = value;
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(headerValue(req, 'range') ?? '');
    const requested = range && (range[1] || range[2]) ? range : null;
    const start = requested?.[1]
      ? Number(requested[1])
      : Math.max(0, meta.size - Number(requested?.[2] ?? meta.size));
    const end =
      requested?.[1] && requested[2] ? Math.min(Number(requested[2]), meta.size - 1) : meta.size - 1;
    if (requested && (start > end || start >= meta.size)) {
      res.setHeader('Content-Range', `bytes */${meta.size}`);
      throw new S3Error(416, 'InvalidRange', 'The requested range is not satisfiable');
    }
    if (requested) headers['Content-Range'] = `bytes ${start}-${end}/${meta.size}`;
    headers['Content-Length'] = String(requested ? end - start + 1 : meta.size);
    res.writeHead(requested ? 206 : 200, headers);
    if (req.method === 'HEAD' || meta.size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(objectPaths(key).object, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };

  const putObject = async (req: IncomingMessage, res: ServerResponse, key: string) => {
    const raw = await readBody(req);
    const chunked = (headerValue(req, 'content-encoding') ?? '').includes('aws-chunked');
    const meta = await writeObject(key, {
      body: chunked ? decodeAwsChunked(raw) : raw,
      contentType: headerValue(req, 'content-type') ?? 'binary/octet-stream',
    });
    res.writeHead(200, { ETag: meta.etag }).end();
  };

  const deleteObject = async (res: ServerResponse, key: string) => {
    const paths = objectPaths(key);
    await rm(paths.object, { force: true });
    await rm(paths.metadata, { force: true });
    res.writeHead(204).end();
  };

  const applyCors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = headerValue(req, 'origin');
    if (!origin || !options.corsOrigins.includes(origin)) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    res.setHeader('Vary', 'Origin');
    return true;
  };

  const sendError = (req: IncomingMessage, res: ServerResponse, error: S3Error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(error.status).end();
      return;
    }
    res
      .writeHead(error.status, { 'Content-Type': 'application/xml' })
      .end(
        `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${error.code}</Code><Message>${xmlEscape(error.message)}</Message><RequestId>fake-s3</RequestId></Error>`,
      );
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const allowed = applyCors(req, res);
    if (req.method === 'OPTIONS') {
      const method = headerValue(req, 'access-control-request-method') ?? '';
      if (!allowed || !CORS_METHODS.includes(method))
        throw new S3Error(403, 'AccessForbidden', 'CORSResponse: This CORS request is not allowed.');
      res
        .writeHead(200, {
          'Access-Control-Allow-Methods': CORS_METHODS.join(', '),
          'Access-Control-Allow-Headers': headerValue(req, 'access-control-request-headers') ?? '',
          'Access-Control-Max-Age': '600',
        })
        .end();
      return;
    }
    const target = req.url ?? '/';
    const queryIndex = target.indexOf('?');
    const rawPath = queryIndex < 0 ? target : target.slice(0, queryIndex);
    const search = queryIndex < 0 ? '' : target.slice(queryIndex);
    const [bucket = '', ...segments] = rawPath.slice(1).split('/');
    if (decodeURIComponent(bucket) !== options.bucket)
      throw new S3Error(404, 'NoSuchBucket', 'The specified bucket does not exist');
    const key = decodeURIComponent(segments.join('/'));
    if (req.method === 'POST' && !key) {
      await postObject(req, res);
      return;
    }
    const query = verifyRequest(req, rawPath, search);
    if (!key) throw new S3Error(501, 'NotImplemented', '버킷 단위 요청은 지원하지 않습니다.');
    if (req.method === 'GET' || req.method === 'HEAD') {
      await getObject(req, res, key, query);
      return;
    }
    if (req.method === 'PUT') {
      await putObject(req, res, key);
      return;
    }
    if (req.method === 'DELETE') {
      await deleteObject(res, key);
      return;
    }
    throw new S3Error(405, 'MethodNotAllowed', '지원하지 않는 요청입니다.');
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      req.resume();
      sendError(
        req,
        res,
        error instanceof S3Error ? error : new S3Error(500, 'InternalError', '저장소 대역 오류입니다.'),
      );
    });
  });
  const host = options.host ?? '127.0.0.1';
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => done());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('S3 대역 주소를 확인할 수 없습니다.');
  const endpoint = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`;
  return {
    endpoint,
    port: address.port,
    bucket: options.bucket,
    env: {
      S3_BUCKET: options.bucket,
      S3_ENDPOINT: endpoint,
      S3_REGION: options.region,
      S3_FORCE_PATH_STYLE: 'true',
      S3_KEY_PREFIX: '',
      AWS_ACCESS_KEY_ID: options.accessKeyId,
      AWS_SECRET_ACCESS_KEY: options.secretAccessKey,
    },
    stop: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
