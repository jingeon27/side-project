import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { buffer } from 'node:stream/consumers';

const secret = 'local-test-secret-key';
export const S3_FIXTURE_CREDENTIALS = { accessKeyId: 'local-test-access-key', secretAccessKey: secret };
interface IStoredObject {
  bytes: Buffer;
  mimeType: string;
}

function policyCondition(condition: unknown, fields: Map<string, string>, size: number): boolean {
  if (Array.isArray(condition)) {
    const [operator, field, expected] = condition;
    if (operator === 'content-length-range')
      return typeof field === 'number' && typeof expected === 'number' && size >= field && size <= expected;
    if (typeof field !== 'string' || typeof expected !== 'string') return false;
    const value = fields.get(field.replace(/^\$/, '').toLowerCase()) ?? '';
    if (operator === 'eq') return value === expected;
    if (operator === 'starts-with') return value.startsWith(expected);
    return false;
  }
  if (!condition || typeof condition !== 'object') return false;
  return Object.entries(condition).every(([key, value]) => fields.get(key.toLowerCase()) === value);
}

/** S3 외부 경계. 실제 SDK가 만든 POST 서명과 정책을 검증하며 AWS로 요청하지 않는다. */
export class S3Fixture {
  readonly objects = new Map<string, IStoredObject>();
  private readonly server = createServer((req, res) => {
    void this.handle(req, res).catch(() => res.writeHead(500).end());
  });

  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return this;
  }
  get endpoint() {
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture is not listening');
    return `http://127.0.0.1:${address.port}`;
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private async post(req: IncomingMessage, res: ServerResponse) {
    const form = await new Response(Uint8Array.from(await buffer(req)), {
      headers: { 'Content-Type': req.headers['content-type'] ?? '' },
    }).formData();
    const file = form.get('file');
    const fields = new Map(
      [...form.entries()]
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key.toLowerCase(), String(value)]),
    );
    const encoded = fields.get('policy') ?? '';
    const policy: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString());
    const credential = (fields.get('x-amz-credential') ?? '').split('/');
    const signingKey = credential
      .slice(1)
      .reduce((key, value) => createHmac('sha256', key).update(value).digest(), Buffer.from(`AWS4${secret}`));
    const signature = createHmac('sha256', signingKey).update(encoded).digest('hex');
    if (
      !(file instanceof File) ||
      !policy ||
      typeof policy !== 'object' ||
      !('conditions' in policy) ||
      !Array.isArray(policy.conditions) ||
      !('expiration' in policy) ||
      typeof policy.expiration !== 'string' ||
      Date.parse(policy.expiration) <= Date.now() ||
      signature !== fields.get('x-amz-signature') ||
      credential[0] !== S3_FIXTURE_CREDENTIALS.accessKeyId ||
      !policy.conditions.every((condition: unknown) => policyCondition(condition, fields, file.size))
    ) {
      res.writeHead(403).end();
      return;
    }
    const key = fields.get('key');
    if (!key) {
      res.writeHead(403).end();
      return;
    }
    this.objects.set(`/media-test/${key}`, {
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: fields.get('content-type') ?? '',
    });
    res.writeHead(204).end();
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.endpoint);
    if (req.method === 'POST') return this.post(req, res);
    if (req.method === 'PUT') {
      this.objects.set(url.pathname, {
        bytes: await buffer(req),
        mimeType: String(req.headers['content-type'] ?? ''),
      });
      res.writeHead(200, { ETag: '"fixture-etag"' }).end();
      return;
    }
    if (req.method === 'DELETE') {
      this.objects.delete(url.pathname);
      res.writeHead(204).end();
      return;
    }
    const object = this.objects.get(url.pathname);
    if (!object) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': object.mimeType, 'Content-Length': object.bytes.length }).end();
      return;
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
    const bytes = range ? object.bytes.subarray(Number(range[1]), Number(range[2]) + 1) : object.bytes;
    res
      .writeHead(range ? 206 : 200, {
        'Content-Type': url.searchParams.get('response-content-type') ?? object.mimeType,
        'Content-Length': bytes.length,
        'Cache-Control': url.searchParams.get('response-cache-control') ?? 'private, no-store',
        ...(range ? { 'Content-Range': `bytes ${range[1]}-${range[2]}/${object.bytes.length}` } : {}),
      })
      .end(bytes);
  }
}
