'use client';

import type { TGroupQueryRef } from './model/group-query.type';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery } from '@apollo/client/react';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { InviteCard } from '@/features/invite';
import { isGroupOwner } from '@/features/group';
import { GalleryDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreatePostButton, GalleryFeed } from '@/features/post';
import { GroupCommunity } from './community/GroupCommunity';

function GroupFrame({ title = '갤러리', children }: { title?: string; children: ReactNode }) {
  return (
    <>
      <TopAppBar title={title} backHref={ROUTES.HOME} />
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
      <section className="flex flex-wrap items-center gap-4 border-b border-line pb-6 tablet:gap-6">
        <span
          aria-hidden
          className="flex size-20 shrink-0 items-center justify-center rounded-full border border-line bg-sunken text-display text-ink"
        >
          {Array.from(group.name.trim())[0] ?? '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-title-lg text-ink">{group.name}</p>
          <p className="mt-1 text-label text-ink">{group.members.length}명이 함께하는 갤러리</p>
          <p className="mt-2 text-caption text-muted">사진도 동영상도, 합성도 환영해요.</p>
        </div>
        <CreatePostButton groupId={group.id} />
      </section>
      <GalleryFeed groupId={group.id} />
      <details className="rounded-card border border-line p-4">
        <summary className="min-h-touch cursor-pointer content-center text-label text-ink">
          초대와 갤러리 멤버
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <InviteCard
            groupId={group.id}
            groupName={group.name}
            inviteToken={group.inviteToken}
            canRegenerate={isGroupOwner(group.role)}
          />
          <GroupCommunity groupRef={groupRef} viewerId={viewerId} />
        </div>
      </details>
    </GroupFrame>
  );
}
function GroupQuerySection({ id, viewerId }: { id: string; viewerId: string }) {
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
