'use client';

import type { TGroupQueryRef } from './model/group-query.type';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery } from '@apollo/client/react';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { InviteCard } from '@/features/invite';
import { isGroupOwner } from '@/features/group';
import { GroupDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { GroupContests } from './contests/GroupContests';
import { GroupCommunity } from './community/GroupCommunity';

function GroupFrame({ title = '그룹', children }: { title?: string; children: ReactNode }) {
  return (
    <>
      <TopAppBar title={title} backHref={ROUTES.HOME} />
      <div className="flex flex-col gap-8 p-4">{children}</div>
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
  viewerId,
  id,
}: {
  groupRef: TGroupQueryRef;
  viewerId: string;
  id: string;
}) {
  const { data, error } = useReadQuery(groupRef);
  const { refetch } = useQueryRefHandlers(groupRef);
  if (!data)
    return (
      <GroupFrame>
        {match(getErrorCode(error))
          .with(ERROR_CODE.Unauthenticated, () => <LoginPanel nextPath={ROUTES.GROUP(id)} />)
          .otherwise(() => (
            <ErrorState
              message={getErrorMessage(error)}
              onRetry={() => {
                void refetch().catch(() => undefined);
              }}
            />
          ))}
      </GroupFrame>
    );
  const group = data.group;
  return (
    <GroupFrame title={group.name}>
      <InviteCard
        groupId={group.id}
        groupName={group.name}
        inviteToken={group.inviteToken}
        canRegenerate={isGroupOwner(group.role)}
      />
      <GroupContests groupRef={groupRef} />
      <GroupCommunity groupRef={groupRef} viewerId={viewerId} />
    </GroupFrame>
  );
}
function GroupQuerySection({ id, viewerId }: { id: string; viewerId: string }) {
  const [groupRef, { refetch }] = useBackgroundQuery(GroupDocument, {
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
      <GroupContent id={id} groupRef={groupRef} viewerId={viewerId} />
    </AsyncBoundary>
  );
}
export function GroupPageTemplate({ id }: { id: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <ViewerBoundary
        guest={
          <GroupFrame>
            <LoginPanel nextPath={ROUTES.GROUP(id)} />
          </GroupFrame>
        }
        fallback={<GroupLoading />}
      >
        {(viewerId) => <GroupQuerySection id={id} viewerId={viewerId} />}
      </ViewerBoundary>
    </div>
  );
}
