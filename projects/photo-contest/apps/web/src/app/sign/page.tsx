import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignPageTemplate } from '@/_pages/sign';
import { query } from '@/shared/api/apollo-client.server';
import { MeDocument } from '@/shared/api/generated';
import { getSafeNextPath } from '@/shared/lib/auth-gate.helper';
import { PRIVATE_ROBOTS } from '@/shared/lib/seo.helper';

export const metadata: Metadata = { title: '시작하기', robots: PRIVATE_ROBOTS };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { data } = await query({ query: MeDocument });
  if (data?.me && !data.me.isAnonymous && !data.me.needsOnboarding)
    redirect(getSafeNextPath((await searchParams).next));
  return <SignPageTemplate continuingAnonymously={Boolean(data?.me?.isAnonymous)} />;
}
