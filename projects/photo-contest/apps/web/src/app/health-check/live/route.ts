import { existsSync } from 'node:fs';

import { connection } from 'next/server';

export async function GET() {
  await connection();
  const draining = Boolean(process.env.WEB_DRAIN_FILE && existsSync(process.env.WEB_DRAIN_FILE));
  return Response.json(
    { status: draining ? 'draining' : 'ok' },
    { status: draining ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
