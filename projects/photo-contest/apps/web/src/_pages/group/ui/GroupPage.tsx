'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

import { useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import { match } from 'ts-pattern';

import { LoginPanel } from '@/features/auth';
import { GroupNavigation } from '@/features/group';
import { GalleryDocument, GroupVisibility } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { FloatingComposeButton } from '@/widgets/compose-entry';
import { NotificationBell } from '@/widgets/notification-bell';
import { GalleryFeed, LatestPosts, PopularPosts } from '@/widgets/post-feed';

import { parseGroupCategory } from '../model/categories/category-search.schema';
import type { TGroupQueryRef } from '../model/group-query.type';
import { PrivateGroupNotice } from './access/PrivateGroupNotice';
import { GroupCategoryFilter } from './categories/GroupCategoryFilter';
import { GroupPostsEmptyState } from './feed/GroupPostsEmptyState';
import { GroupSidebar } from './GroupSidebar';
import { GroupIdentity } from './header/GroupIdentity';

function GroupFrame({
  title = '그룹',
  children,
  hasFloatingAction = false,
}: {
  title?: string;
  children: ReactNode;
  hasFloatingAction?: boolean;
}) {
  return (
    <>
      <TopAppBar title={title} backHref={ROUTES.EXPLORE} actions={<NotificationBell />} />
      <div
        className={cn(
          'flex flex-col gap-8 px-4 py-6 tablet:px-8',
          hasFloatingAction && 'pb-24 desktop:pb-28',
        )}
      >
        {children}
      </div>
    </>
  );
}
function GroupLoading() {
  return (
    <GroupFrame>
      <Skeleton className="h-48 w-full" />
    </GroupFrame>
  );
}
function GroupContent({
  groupRef,
  id,
  onRefresh,
}: {
  groupRef: TGroupQueryRef;
  id: string;
  onRefresh: () => Promise<unknown>;
}) {
  const router = useAppRouter();
  const communityRef = useRef<HTMLDetailsElement>(null);
  const handleCommunityRef = useCallback((details: HTMLDetailsElement | null) => {
    communityRef.current = details;
    if (!details) return;
    return () => {
      communityRef.current = null;
    };
  }, []);
  const { data, error } = useReadQuery(groupRef);
  const writePath = data?.group.role ? ROUTES.GROUP_WRITE(data.group.id) : null;
  useEffect(() => {
    if (writePath) router.prefetch(writePath);
  }, [router, writePath]);
  const handleOpenCommunity = () => {
    const details = communityRef.current;
    if (!details) return;
    details.open = true;
    details.querySelector('summary')?.focus({ preventScroll: true });
    details.scrollIntoView({ block: 'start' });
  };
  if (!data)
    return (
      <GroupFrame>
        {match(getErrorCode(error))
          .with(ERROR_CODE.Unauthenticated, () => <LoginPanel nextPath={ROUTES.GROUP(id)} />)
          .otherwise(() => (
            <ErrorState
              message={getErrorMessage(error)}
              onRetry={async () => {
                try {
                  await onRefresh();
                } catch {
                  /* 실패하면 같은 안내가 남는다. */
                }
              }}
            />
          ))}
      </GroupFrame>
    );
  const group = data.group;
  return (
    <GroupFrame title={group.name} hasFloatingAction={group.role !== null}>
      <GroupIdentity groupRef={groupRef} onOpenCommunity={handleOpenCommunity} />
      {group.canViewPosts ? <GroupNavigation groupId={group.id} className="max-w-6xl" /> : null}
      {group.canViewPosts ? (
        <GroupFeed
          groupRef={groupRef}
          sidebar={<GroupSidebar groupRef={groupRef} communityRef={handleCommunityRef} />}
        />
      ) : (
        <PrivateGroupNotice groupRef={groupRef} onRefresh={onRefresh} />
      )}
      {group.role !== null ? (
        <FloatingComposeButton label="글쓰기" onClick={() => router.push(ROUTES.GROUP_WRITE(group.id))} />
      ) : null}
    </GroupFrame>
  );
}
function GroupFeed({ groupRef, sidebar }: { groupRef: TGroupQueryRef; sidebar?: ReactNode }) {
  const { data } = useReadQuery(groupRef);
  const search = useSearchParams();
  if (!data) return null;
  const { group } = data;
  const categoryId = parseGroupCategory(search.get('category'), group.categories);
  // 비공개 그룹의 게시물은 라우트가 사전 조회하지 않는다.
  const preloaded = group.visibility !== GroupVisibility.Private;
  return (
    <div className="flex flex-col gap-5">
      <GroupCategoryFilter group={group} categoryId={categoryId} />
      <GalleryFeed
        latest={
          <LatestPosts
            groupId={group.id}
            categoryId={categoryId ?? undefined}
            title="최신 게시물"
            empty={<GroupPostsEmptyState group={group} categoryId={categoryId} />}
            preloaded={preloaded}
          />
        }
        popular={
          <PopularPosts
            groupId={group.id}
            preloaded={preloaded}
            empty={<p className="text-body text-muted">이번 달에 올라온 게시물이 아직 없어요.</p>}
          />
        }
        sidebar={sidebar}
      />
    </div>
  );
}
function GroupQuerySection({ id }: { id: string }) {
  const [groupRef, { refetch }] = useBackgroundQuery(GalleryDocument, {
    variables: { id },
    errorPolicy: 'all',
  });
  return (
    <AsyncBoundary
      resetKey={id}
      fallback={<GroupLoading />}
      onRetry={refetch}
      renderError={(error, onRetry) => (
        <GroupFrame>
          {match(getErrorCode(error))
            .with(ERROR_CODE.Unauthenticated, () => <LoginPanel nextPath={ROUTES.GROUP(id)} />)
            .otherwise(() => (
              <ErrorState message={getErrorMessage(error)} onRetry={onRetry} />
            ))}
        </GroupFrame>
      )}
    >
      <GroupContent id={id} groupRef={groupRef} onRefresh={refetch} />
    </AsyncBoundary>
  );
}
export function GroupPage({ id }: { id: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <GroupQuerySection id={id} />
    </div>
  );
}
