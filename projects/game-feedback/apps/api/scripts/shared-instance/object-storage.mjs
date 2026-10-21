// Test-only S3 boundary: private bucket credentials, Range, and byte persistence.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';

const objects = new Map();
const allowed = { 'gf-smoke-private': 'gf-smoke-access', 'pc-smoke-private': 'pc-smoke-access' };
createServer(
  { key: readFileSync('/certs/server.key'), cert: readFileSync('/certs/server.crt') },
  async (req, res) => {
    const bucket = req.headers.host?.split('.')[0];
    const url = new URL(req.url, 'https://storage.test');
    const key = `${bucket}${url.pathname}`;
    // Fixture 경계는 header와 presigned query 양쪽에서 버킷별 credential을 확인한다.
    const credential =
      req.headers.authorization?.match(/Credential=([^, ]+)/)?.[1] ??
      url.searchParams.get('X-Amz-Credential');
    if (!allowed[bucket] || !credential?.startsWith(`${allowed[bucket]}/`)) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'x-amz-bucket-region': 'ap-northeast-2' }).end();
      return;
    }
    if (req.method === 'PUT') {
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
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
    const bytes = range ? object.bytes.subarray(Number(range[1]), Number(range[2]) + 1) : object.bytes;
    res.writeHead(range ? 206 : 200, {
      'Content-Type': url.searchParams.get('response-content-type') ?? object.type,
      'Content-Length': bytes.length,
      'Cache-Control': url.searchParams.get('response-cache-control') ?? 'private, no-store',
      ...(range ? { 'Content-Range': `bytes ${range[1]}-${range[2]}/${object.bytes.length}` } : {}),
    });
    res.end(bytes);
  },
).listen(443, '0.0.0.0');
