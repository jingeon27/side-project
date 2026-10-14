'use client';

import { useQuery } from '@apollo/client/react';

import { LoginPanel, LogoutButton } from '@/features/auth';
import { MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { getErrorMessage } from '@/shared/model/error';
import { Avatar } from '@/shared/ui/@core/avatar';
import { ButtonLink } from '@/shared/ui/@core/button';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

export function MePageTemplate() {
  const { data, error, refetch } = useQuery(MeDocument);
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="MY" />
      <div className="flex flex-1 flex-col gap-6 p-4">
        {error ? (
          <ErrorState
            message={getErrorMessage(error)}
            onRetry={() => {
              refetch().catch(() => undefined);
            }}
          />
        ) : !data ? (
          <Skeleton className="h-32 w-full" />
        ) : !data.me ? (
          <LoginPanel nextPath={ROUTES.ME} />
        ) : (
          <>
            <section className="flex items-center gap-4 rounded-card bg-brand-soft p-5">
              <Avatar name={data.me.nickname} src={data.me.avatar} />
              <div className="min-w-0">
                <h2 className="break-words text-title text-ink">{data.me.nickname}</h2>
                <p className="mt-1 text-caption text-muted">우리끼리 모은 순간을 다시 만나보세요.</p>
              </div>
            </section>
            <ButtonLink href={ROUTES.HOME} variant="secondary">
              내 그룹 보기
            </ButtonLink>
            <LogoutButton />
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
