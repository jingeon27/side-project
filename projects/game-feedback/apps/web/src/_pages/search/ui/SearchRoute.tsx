import 'server-only';
import { notFound } from 'next/navigation';
import { resolveAppRoute } from '@game-feedback/bridge';
import { getServerSession } from '@/features/auth/index.server';
import { getPublicCategories } from '@/features/category/index.server';
import { getServerPostList } from '@/features/post/index.server';
import { initialDocumentData } from '@/shared/lib/initial-document-data';
import { searchQuery, type ISearchSnapshot } from '../model/search-query';
import { SearchPage } from './SearchPage';

export async function SearchRoute({
  locale,
  searchParams,
  blockUntilReady,
}: {
  locale: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  blockUntilReady: boolean;
}) {
  const values = await searchParams;
  if (Object.values(values).some(Array.isArray)) notFound();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (typeof value === 'string') params.set(key, value);
  const route = resolveAppRoute(`/${locale}/search${params.size ? `?${params}` : ''}`);
  if (!route) notFound();
  const { request } = searchQuery(route.path);
  if (
    request.category &&
    !(await getPublicCategories()).some((category) => category.active && category.slug === request.category)
  )
    notFound();
  const snapshot = async (): Promise<ISearchSnapshot> => {
    const [posts, session] = await Promise.all([
      request.q ? getServerPostList(request) : null,
      getServerSession(),
    ]);
    return { path: route.path, posts, viewerId: session.user?.id };
  };
  const initial = await initialDocumentData(snapshot(), blockUntilReady);
  return <SearchPage locale={locale} initialPath={route.path} initialSearch={initial.value} />;
}
