import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connection } from 'next/server';

export async function GET() {
  await connection();
  const draining = existsSync(join(tmpdir(), 'side-web-draining'));
  return Response.json(
    { status: draining ? 'draining' : 'ok' },
    { status: draining ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
