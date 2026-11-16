import { connection } from 'next/server';

import { createDetailShareImage } from '@/_app/seo/index.server';

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  await connection();
  const { kind, id } = await params;
  return createDetailShareImage(kind, id);
}
