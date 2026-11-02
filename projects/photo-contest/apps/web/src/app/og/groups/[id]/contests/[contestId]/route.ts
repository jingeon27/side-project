import { connection } from 'next/server';

import { createGroupShareImage } from '@/_app/seo/index.server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; contestId: string }> },
) {
  await connection();
  const data = await params;
  return createGroupShareImage(data.id, data.contestId);
}
