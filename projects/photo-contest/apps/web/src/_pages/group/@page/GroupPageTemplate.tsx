'use client';

import type { TGroupQueryRef } from './model/group-query.type';

import { useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';

import { LoginPanel } from '@/features/auth';
import { GroupMembershipButton, GroupNavigation } from '@/features/group';
import { GalleryDocument, GroupVisibility } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary, ClientOnly } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreatePostButton, GalleryFeed } from '@/features/post';
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
      <TopAppBar title={title} backHref={ROUTES.EXPLORE} actions={actions} />
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
              onRetry={() => {
                void onRefresh().catch(() => undefined);
              }}
            />
          ))}
      </GroupFrame>
    );
  const group = data.group;
  return (
    <GroupFrame
      title={group.name}
      actions={
        group.role ? (
          <CreatePostButton groupId={group.id} />
        ) : group.canViewPosts ? (
          <GroupMembershipButton groupId={group.id} />
        ) : undefined
      }
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
  if (!data) return null;
  const feed = <GalleryFeed groupId={data.group.id} sidebar={sidebar} />;
  if (data.group.visibility === GroupVisibility.Private)
    return <ClientOnly fallback={<Skeleton className="h-48 w-full" />}>{feed}</ClientOnly>;
  return feed;
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
      renderError={(error, retry) => (
        <GroupFrame>
          {match(getErrorCode(error))
            .with(ERROR_CODE.Unauthenticated, () => <LoginPanel nextPath={ROUTES.GROUP(id)} />)
            .otherwise(() => (
              <ErrorState message={getErrorMessage(error)} onRetry={retry} />
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
