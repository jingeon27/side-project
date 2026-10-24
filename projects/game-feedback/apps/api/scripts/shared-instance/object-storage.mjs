// Test-only S3 boundary: private bucket credentials, presigned POST policies, HEAD, Range, and byte persistence.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const objects = new Map();
const allowed = { 'gf-smoke-private': 'gf-smoke-access', 'pc-smoke-private': 'pc-smoke-access' };

// Browser uploads carry the credential and policy in form fields instead of headers.
async function postObject(req, res, bucket) {
  const form = await new Request('https://storage.test/', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body: Readable.toWeb(req),
    duplex: 'half',
  }).formData();
  const fields = new Map();
  let file;
  for (const [name, value] of form) {
    if (name.toLowerCase() === 'file') {
      file = value;
      break;
    }
    fields.set(name.toLowerCase(), value);
  }
  const credential = fields.get('x-amz-credential');
  if (!credential?.startsWith(`${allowed[bucket]}/`) || !fields.get('x-amz-signature') || !file) {
    res.writeHead(403).end();
    return;
  }
  const policy = JSON.parse(Buffer.from(fields.get('policy') ?? '', 'base64').toString());
  const conditions = policy.conditions ?? [];
  const range = conditions.find(
    (condition) => Array.isArray(condition) && condition[0] === 'content-length-range',
  );
  const exact = conditions.flatMap((condition) =>
    Array.isArray(condition)
      ? condition[0] === 'eq'
        ? [[condition[1].slice(1).toLowerCase(), condition[2]]]
        : []
      : Object.entries(condition).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const valid =
    Date.parse(policy.expiration) > Date.now() &&
    exact.every(([name, value]) => (name === 'bucket' ? bucket : fields.get(name)) === value) &&
    (!range || (file.size >= range[1] && file.size <= range[2]));
  if (!valid) {
    res.writeHead(403).end();
    return;
  }
  objects.set(`${bucket}/${fields.get('key')}`, {
    bytes: Buffer.from(await file.arrayBuffer()),
    type: fields.get('content-type') ?? 'binary/octet-stream',
  });
  res.writeHead(204, { ETag: '"smoke-etag"' }).end();
}

export async function handleObjectStorage(req, res) {
  const bucket = req.headers.host?.split('.')[0];
  const url = new URL(req.url, 'https://storage.test');
  const key = `${bucket}${url.pathname}`;
  if (req.method === 'POST' && url.pathname === '/' && allowed[bucket]) {
    await postObject(req, res, bucket).catch(() => res.writeHead(400).end());
    return;
  }
  // Fixture 경계는 header와 presigned query 양쪽에서 버킷별 credential을 확인한다.
  const credential =
    req.headers.authorization?.match(/Credential=([^, ]+)/)?.[1] ?? url.searchParams.get('X-Amz-Credential');
  if (!allowed[bucket] || !credential?.startsWith(`${allowed[bucket]}/`)) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === 'HEAD' && url.pathname === '/') {
    res.writeHead(200, { 'x-amz-bucket-region': 'ap-northeast-2' }).end();
    return;
  }
  if (req.method === 'PUT') {
    const copySource = req.headers['x-amz-copy-source'];
    if (copySource) {
      const source = decodeURIComponent(copySource).replace(/^\//, '');
      const object = objects.get(source);
      if (!source.startsWith(`${bucket}/`) || !object) {
        res.writeHead(404).end();
        return;
      }
      if (req.headers['x-amz-copy-source-if-match'] !== '"smoke-etag"') {
        res.writeHead(412).end();
        return;
      }
      objects.set(key, {
        bytes: Buffer.from(object.bytes),
        type: req.headers['content-type'] ?? object.type,
      });
      res
        .writeHead(200, { 'Content-Type': 'application/xml' })
        .end(
          `<CopyObjectResult><LastModified>${new Date().toISOString()}</LastModified><ETag>&quot;smoke-etag&quot;</ETag></CopyObjectResult>`,
        );
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    // AWS SDK uses aws-chunked payloads for some streamed uploads; application uploads use Buffers.
    objects.set(key, {
      bytes: Buffer.concat(chunks),
      type: req.headers['content-type'] ?? 'application/octet-stream',
    });
    res.writeHead(200, { ETag: '"smoke-etag"' }).end();
    return;
  }
  if (req.method === 'DELETE') {
    objects.delete(key);
    res.writeHead(204).end();
    return;
  }
  const object = objects.get(key);
  if (!object) {
    res.writeHead(404).end();
    return;
  }
  if (req.method === 'HEAD') {
    res
      .writeHead(200, {
        'Content-Type': object.type,
        'Content-Length': object.bytes.length,
        ETag: '"smoke-etag"',
      })
      .end();
    return;
  }
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
  const bytes = range ? object.bytes.subarray(Number(range[1]), Number(range[2]) + 1) : object.bytes;
  res.writeHead(range ? 206 : 200, {
    'Content-Type': url.searchParams.get('response-content-type') ?? object.type,
    'Content-Length': bytes.length,
    'Cache-Control': url.searchParams.get('response-cache-control') ?? 'private, no-store',
    ...(range ? { 'Content-Range': `bytes ${range[1]}-${range[2]}/${object.bytes.length}` } : {}),
  });
  res.end(bytes);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer(
    { key: readFileSync('/certs/server.key'), cert: readFileSync('/certs/server.crt') },
    handleObjectStorage,
  ).listen(443, '0.0.0.0');
}
