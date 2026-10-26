// Test-only S3 boundary: private bucket credentials, presigned POST policies, HEAD, Range, and byte persistence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function policyCondition(value: unknown) {
  if (Array.isArray(value)) {
    const parts: readonly unknown[] = value;
    const [operator, first, second] = parts;
    if (operator === 'content-length-range') {
      assert.ok(typeof first === 'number' && Number.isFinite(first));
      assert.ok(typeof second === 'number' && Number.isFinite(second));
      return { kind: 'range' as const, minimum: first, maximum: second };
    }
    if (operator === 'eq') {
      assert.ok(typeof first === 'string' && typeof second === 'string');
      return { kind: 'equal' as const, name: first.slice(1).toLowerCase(), value: second };
    }
    return { kind: 'ignored' as const };
  }
  assert.ok(isObject(value));
  const values = Object.entries(value).map(([name, field]) => {
    assert.ok(typeof field === 'string');
    return [name.toLowerCase(), field] as const;
  });
  return { kind: 'fields' as const, values };
}

function postPolicy(value: unknown) {
  assert.ok(isObject(value) && typeof value.expiration === 'string');
  const conditions: unknown = value.conditions ?? [];
  assert.ok(Array.isArray(conditions));
  const entries: unknown[] = conditions;
  return { expiration: value.expiration, conditions: entries.map(policyCondition) };
}

const objects = new Map<string, { bytes: Buffer; type: string }>();
const allowed = new Map([
  ['gf-smoke-private', 'gf-smoke-access'],
  ['pc-smoke-private', 'pc-smoke-access'],
]);

// Browser uploads carry the credential and policy in form fields instead of headers.
async function postObject(req: IncomingMessage, res: ServerResponse, bucket: string) {
  const form = await new Request('https://storage.test/', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body: Readable.toWeb(req),
    duplex: 'half',
  }).formData();
  const entries = [...form];
  const fileIndex = entries.findIndex(([name]) => name.toLowerCase() === 'file');
  const file = entries[fileIndex]?.[1];
  const fields = new Map(
    entries
      .slice(0, fileIndex < 0 ? entries.length : fileIndex)
      .flatMap(([name, value]) => (typeof value === 'string' ? [[name.toLowerCase(), value] as const] : [])),
  );
  const credential = fields.get('x-amz-credential');
  if (
    !credential?.startsWith(`${allowed.get(bucket)}/`) ||
    !fields.get('x-amz-signature') ||
    !file ||
    typeof file === 'string'
  ) {
    res.writeHead(403).end();
    return;
  }
  const input: unknown = JSON.parse(Buffer.from(fields.get('policy') ?? '', 'base64').toString());
  const policy = postPolicy(input);
  const range = policy.conditions.find((condition) => condition.kind === 'range');
  const exact = policy.conditions.flatMap((condition) => {
    if (condition.kind === 'equal') return [[condition.name, condition.value] as const];
    if (condition.kind === 'fields') return condition.values;
    return [];
  });
  const valid =
    Date.parse(policy.expiration) > Date.now() &&
    exact.every(([name, value]) => (name === 'bucket' ? bucket : fields.get(name)) === value) &&
    (!range || (file.size >= range.minimum && file.size <= range.maximum));
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

export async function handleObjectStorage(req: IncomingMessage, res: ServerResponse) {
  const bucket = req.headers.host?.split('.')[0] ?? '';
  const url = new URL(req.url ?? '/', 'https://storage.test');
  const key = `${bucket}${url.pathname}`;
  if (req.method === 'POST' && url.pathname === '/' && allowed.get(bucket)) {
    await postObject(req, res, bucket).catch(() => res.writeHead(400).end());
    return;
  }
  // Fixture 경계는 header와 presigned query 양쪽에서 버킷별 credential을 확인한다.
  const credential =
    req.headers.authorization?.match(/Credential=([^, ]+)/)?.[1] ?? url.searchParams.get('X-Amz-Credential');
  if (!allowed.get(bucket) || !credential?.startsWith(`${allowed.get(bucket)}/`)) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === 'HEAD' && url.pathname === '/') {
    res.writeHead(200, { 'x-amz-bucket-region': 'ap-northeast-2' }).end();
    return;
  }
  if (req.method === 'PUT') {
    const copySource = req.headers['x-amz-copy-source'];
    if (typeof copySource === 'string') {
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
    const chunks: Buffer[] = [];
    const stream: AsyncIterable<unknown> = req;
    for await (const chunk of stream) {
      assert.ok(Buffer.isBuffer(chunk), 'Expected an HTTP byte chunk');
      chunks.push(chunk);
    }
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
