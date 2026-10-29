'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

import { useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import { match, P } from 'ts-pattern';

import { LoginPanel } from '@/features/auth';
import { GroupMembershipButton, GroupNavigation } from '@/features/group';
import { CreatePostButton, GalleryFeed, LatestPosts, PopularPosts, PostsEmptyState } from '@/features/post';
import { GalleryDocument, GroupVisibility } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { NotificationBell } from '@/widgets/notification-bell';

import { parseGroupCategory } from './model/category-search.schema';
import type { TGroupQueryRef } from './model/group-query.type';
import { GroupCategoryFilter } from './ui/GroupCategoryFilter';
import { GroupIdentity } from './ui/GroupIdentity';
import { GroupSidebar } from './ui/GroupSidebar';
import { PrivateGroupNotice } from './ui/PrivateGroupNotice';

function GroupFrame({
  title = '그룹',
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <TopAppBar
        title={title}
        backHref={ROUTES.EXPLORE}
        actions={
          <>
            {actions}
            <NotificationBell />
          </>
        }
      />
      <div className="flex flex-col gap-8 px-4 py-6 tablet:px-8">{children}</div>
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
  const { data, error } = useReadQuery(groupRef);
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
    <GroupFrame
      title={group.name}
      actions={match(group)
        .with({ role: P.nonNullable }, () => <CreatePostButton groupId={group.id} />)
        .with({ canViewPosts: true }, () => <GroupMembershipButton groupId={group.id} />)
        .with({ canViewPosts: false }, () => undefined)
        .exhaustive()}
    >
      <GroupIdentity groupRef={groupRef} />
      {group.canViewPosts ? <GroupNavigation groupId={group.id} /> : null}
      {group.canViewPosts ? (
        <GroupFeed groupRef={groupRef} sidebar={<GroupSidebar groupRef={groupRef} />} />
      ) : (
        <PrivateGroupNotice groupRef={groupRef} onRefresh={onRefresh} />
      )}
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
            empty={<PostsEmptyState />}
            preloaded={preloaded}
          />
        }
        popular={<PopularPosts groupId={group.id} preloaded={preloaded} />}
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
export function GroupPageTemplate({ id }: { id: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <GroupQuerySection id={id} />
    </div>
  );
}
