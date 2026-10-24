'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { match } from 'ts-pattern';

import { LoginPanel } from '@/features/auth';
import {
  GalleryDocument,
  GroupVisibility,
  type GalleryQuery,
  type GalleryQueryVariables,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary, ClientOnly } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { GroupMembershipButton } from './GroupMembershipButton';
import { GroupNavigation } from './GroupNavigation';

interface IGroupContentFrameProps {
  groupId: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}
type TGalleryRef = QueryRef<GalleryQuery, GalleryQueryVariables, 'empty' | 'complete' | 'streaming'>;

/** 그룹 화면과 같은 기준: 만료된 세션은 이 화면으로 돌아오는 로그인, 그 밖(없는 그룹·연결 실패)은 재시도 안내 */
function GroupContentFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const pathname = usePathname();
  return match(getErrorCode(error))
    .with(ERROR_CODE.Unauthenticated, () => <LoginPanel nextPath={pathname} />)
    .otherwise(() => <ErrorState message={getErrorMessage(error)} onRetry={onRetry} />);
}

function GroupContent({
  groupRef,
  onRefresh,
  children,
  actions,
}: {
  groupRef: TGalleryRef;
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { data, error } = useReadQuery(groupRef);
  if (!data)
    return (
      <GroupContentFailure
        error={error}
        onRetry={async () => {
          try {
            await onRefresh();
          } catch {
            /* 실패하면 같은 안내가 남는다. */
          }
        }}
      />
    );
  const group = data.group;
  if (!group.canViewPosts)
    return (
      <section
        className="mx-auto flex w-full max-w-app flex-col items-center gap-5 rounded-card border border-line bg-surface p-8 text-center"
        aria-label="비공개 그룹 안내"
      >
        <h2 className="text-title">비공개 그룹이에요</h2>
        <p className="text-body text-muted">
          그룹장이 가입 신청을 수락하면 대회와 명예의 전당을 볼 수 있어요.
        </p>
        <GroupMembershipButton groupId={group.id} />
        <Link href={ROUTES.GROUP(group.id)} className="text-label underline underline-offset-4">
          그룹으로 이동
        </Link>
      </section>
    );
  return (
    <>
      <GroupNavigation groupId={group.id} />
      {actions ? <div className="flex justify-end">{actions}</div> : null}
      {group.visibility === GroupVisibility.Private ? (
        <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>{children}</ClientOnly>
      ) : (
        children
      )}
    </>
  );
}

export function GroupContentFrame({ groupId, title, children, actions }: IGroupContentFrameProps) {
  const [groupRef, { refetch }] = useBackgroundQuery(GalleryDocument, {
    variables: { id: groupId },
    errorPolicy: 'all',
  });
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title={title} backHref={ROUTES.GROUP(groupId)} />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 tablet:px-8">
        <AsyncBoundary
          fallback={<Skeleton className="h-64 w-full" />}
          onRetry={() => refetch()}
          renderError={(error, onRetry) => <GroupContentFailure error={error} onRetry={onRetry} />}
        >
          <GroupContent groupRef={groupRef} onRefresh={() => refetch()} actions={actions}>
            {children}
          </GroupContent>
        </AsyncBoundary>
      </div>
    </div>
  );
}
