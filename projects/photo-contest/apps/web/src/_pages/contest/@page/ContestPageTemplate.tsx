'use client';

import { useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import { match } from 'ts-pattern';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { ContestDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { ContestHeader } from './header/ContestHeader';
import { ContestGuide } from './guide/ContestGuide';
import { ContestPhaseSync } from './phase/ContestPhaseSync';
import { ContestStage } from './phase/ContestStage';
import { ContestSubmissionCta } from './submission/ContestSubmissionCta';
import { HiddenPhotos } from './moderation/HiddenPhotos';
import type { TContestQueryRef } from './model/contest-query.type';

function ContestLoading() {
  return (
    <>
      <TopAppBar title="대회" backHref={ROUTES.HOME} />
      <Skeleton className="m-4 h-48" />
    </>
  );
}
function ContestFailure({ id, error, retry }: { id: string; error: unknown; retry: () => void }) {
  return (
    <>
      <TopAppBar title="대회" backHref={ROUTES.HOME} />
      <div className="p-4">
        {match(getErrorCode(error))
          .with(ERROR_CODE.Unauthenticated, () => <LoginPanel nextPath={ROUTES.CONTEST(id)} />)
          .otherwise(() => (
            <ErrorState message={getErrorMessage(error)} onRetry={retry} />
          ))}
      </div>
    </>
  );
}
function ContestContent({
  id,
  contestRef,
  viewerId,
  retry,
}: {
  id: string;
  contestRef: TContestQueryRef;
  viewerId: string;
  retry: () => void;
}) {
  const { data, error } = useReadQuery(contestRef);
  if (!data) return <ContestFailure id={id} error={error} retry={retry} />;
  return (
    <>
      <ContestPhaseSync contestRef={contestRef} />
      <ContestHeader contestRef={contestRef} />
      <div className="flex flex-1 flex-col gap-5 p-4">
        <ContestGuide contestRef={contestRef} />
        <ContestStage contestRef={contestRef} viewerId={viewerId} />
        <HiddenPhotos contestRef={contestRef} viewerId={viewerId} />
      </div>
      <ContestSubmissionCta contestRef={contestRef} />
    </>
  );
}
function ContestQuerySection({ id, viewerId }: { id: string; viewerId: string }) {
  const [contestRef, { refetch }] = useBackgroundQuery(ContestDocument, {
    variables: { id },
    errorPolicy: 'all',
  });
  const handleRetry = async () => {
    try {
      await refetch();
    } catch {
      /* 조회 경계가 실패를 보여 준다. */
    }
  };
  return (
    <AsyncBoundary
      resetKey={id}
      fallback={<ContestLoading />}
      onRetry={refetch}
      renderError={(error, retry) => <ContestFailure id={id} error={error} retry={retry} />}
    >
      <ContestContent id={id} contestRef={contestRef} viewerId={viewerId} retry={handleRetry} />
    </AsyncBoundary>
  );
}
export function ContestPageTemplate({ id }: { id: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <ViewerBoundary
        guest={
          <>
            <TopAppBar title="대회" backHref={ROUTES.HOME} />
            <div className="p-4">
              <LoginPanel nextPath={ROUTES.CONTEST(id)} />
            </div>
          </>
        }
        fallback={<ContestLoading />}
      >
        {(viewerId) => <ContestQuerySection id={id} viewerId={viewerId} />}
      </ViewerBoundary>
    </div>
  );
}
