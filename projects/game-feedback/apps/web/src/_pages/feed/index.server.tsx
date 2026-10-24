import 'server-only';

import { getServerSession } from '@/features/auth/index.server';
import { getServerPostList } from '@/features/post/index.server';
import { initialDocumentData } from '@/shared/lib/initial-document-data';

import type { IFeedSnapshot } from './model/feed-snapshot.type';
import { FeedPage } from './ui/FeedPage';

interface IFeedRouteProps {
  locale: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  blockUntilReady: boolean;
}

async function snapshot(searchParams: IFeedRouteProps['searchParams']): Promise<IFeedSnapshot> {
  const [params, session] = await Promise.all([searchParams, getServerSession()]);
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? '';
  const tab = params.tab === 'unanswered' ? 'unanswered' : 'latest';
  const posts = await getServerPostList({
    limit: 8,
    board: tab === 'unanswered' ? 'FEEDBACK' : 'ALL',
    ...(tab === 'unanswered' ? { unanswered: 'true' } : {}),
    ...(q ? { q } : {}),
  });
  return { posts, q, tab, viewerId: session.user?.id };
}

export async function FeedRoute({ locale, searchParams, blockUntilReady }: IFeedRouteProps) {
  const initial = await initialDocumentData(snapshot(searchParams), blockUntilReady);
  return <FeedPage locale={locale} initialFeed={initial.value} />;
}
