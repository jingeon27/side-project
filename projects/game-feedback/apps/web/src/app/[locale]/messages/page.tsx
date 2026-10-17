import { Suspense } from 'react';
import { LoadingState } from '@/shared/ui';
import { staticPageMetadata } from '@/shared/seo';
import { notFound, redirect } from 'next/navigation';
import { appRoutes, RouteIdSchema } from '@game-feedback/bridge';
async function RouteContent({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ conversation?: string | string[] }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  if (query.conversation !== undefined) {
    const id = RouteIdSchema.safeParse(query.conversation);
    if (!id.success) notFound();
    redirect(appRoutes.conversation(locale, id.data));
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('messages', (await params).locale);
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
