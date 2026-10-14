'use client';

import { useQuery } from '@apollo/client/react';
import { Share2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { overlay } from 'overlay-kit';

import { LoginPanel } from '@/features/auth';
import { PhaseBadge, getPhaseDeadline, getPhaseGuide } from '@/features/contest';
import { ModerationActions } from '@/features/moderation';
import { buildContestShareText, useShareActions } from '@/features/share';
import { SubmissionCard, UploadPhotoBottomSheet } from '@/features/submission';
import { ContestDocument, MeDocument, Phase } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatDateTime } from '@/shared/lib/format.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { ERROR_CODE, getErrorCode, getErrorMessage } from '@/shared/model/error';
import { replaceSearchParams } from '@/shared/model/router';
import { Button } from '@/shared/ui/@core/button';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { IconButton } from '@/shared/ui/@core/icon-button';
import { SegmentedControl } from '@/shared/ui/@core/segmented-control';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { StickyCta } from '@/shared/ui/@core/sticky-cta';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { ContestFeed } from './feed/ContestFeed';
import { contestSearchSchema } from './model/contest-search.schema';
import { ContestResults } from './results/ContestResults';

const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '좋아요순' },
] as const;

export function ContestPageTemplate({ id }: { id: string }) {
  const me = useQuery(MeDocument);
  const query = useQuery(ContestDocument, { variables: { id }, errorPolicy: 'all' });
  const searchParams = useSearchParams();
  const { sort } = contestSearchSchema.parse({ sort: searchParams.get('sort') ?? undefined });
  const shareActions = useShareActions();
  const contest = query.data?.contest;
  const viewer = me.data?.me;
  if (getErrorCode(query.error) === ERROR_CODE.Unauthenticated || viewer === null)
    return (
      <div className="flex flex-1 flex-col">
        <TopAppBar title="대회" backHref={ROUTES.HOME} />
        <div className="p-4">
          <LoginPanel nextPath={ROUTES.CONTEST(id)} />
        </div>
      </div>
    );
  if (!contest || !viewer)
    return (
      <div className="flex flex-1 flex-col">
        <TopAppBar title="대회" backHref={ROUTES.HOME} />
        {query.error || me.error ? (
          <ErrorState
            message={getErrorMessage(query.error ?? me.error)}
            onRetry={() => {
              query.refetch().catch(() => undefined);
              me.refetch().catch(() => undefined);
            }}
          />
        ) : (
          <Skeleton className="m-4 h-48" />
        )}
      </div>
    );
  const deadline = getPhaseDeadline(contest.phase, contest);
  const guide = getPhaseGuide({
    phase: contest.phase,
    hasSubmitted: Boolean(contest.mySubmissionId),
    hasVoted: Boolean(contest.votedSubmissionId),
  });
  const handleShare = async () => {
    const method = await shareActions.share(
      `${window.location.origin}${ROUTES.CONTEST(id)}`,
      {
        title: '웃긴순간 사진 대회',
        text: buildContestShareText(contest.title),
      },
      { copied: '대회 링크를 복사했어요' },
    );
    if (method) trackEvent(ANALYTICS_EVENT.ContestShared, { contest_id: id, method });
  };
  const handleSubmitPhoto = () =>
    overlay.open(({ isOpen, close, unmount }) => (
      <UploadPhotoBottomSheet contestId={id} isOpen={isOpen} onClose={close} unmount={unmount} />
    ));
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar
        title={contest.title}
        backHref={ROUTES.GROUP(contest.groupId)}
        actions={
          <IconButton label="대회 공유" onClick={handleShare}>
            <Share2 className="size-5" />
          </IconButton>
        }
      />
      <div className="flex flex-1 flex-col gap-5 p-4">
        <section className="rounded-card bg-brand-soft p-4">
          <PhaseBadge phase={contest.phase} />
          <h2 className="mt-3 text-title text-ink">{guide.title}</h2>
          <p className="mt-1 text-body text-muted">{guide.description}</p>
          <p className="mt-3 text-caption text-muted">
            {deadline.label} {formatDateTime(deadline.at)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              query.refetch().catch(() => undefined);
            }}
          >
            대회 상태 새로고침
          </Button>
        </section>
        {contest.phase === Phase.Completed ? (
          <ContestResults
            key={id}
            contestId={id}
            title={contest.title}
            viewerId={viewer.id}
            isAdmin={contest.isAdmin}
          />
        ) : contest.phase === Phase.Upcoming ? null : (
          <>
            <SegmentedControl
              label="사진 정렬"
              value={sort}
              options={SORT_OPTIONS}
              onValueChange={(next) => {
                replaceSearchParams({ sort: next });
                trackEvent(ANALYTICS_EVENT.PhotoSortChanged, { contest_id: id, sort: next });
              }}
            />
            <ContestFeed key={sort} contest={contest} viewerId={viewer.id} sort={sort} />
          </>
        )}
        {contest.isAdmin && contest.hiddenSubmissions.length ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-title text-ink">숨긴 사진</h2>
            {contest.hiddenSubmissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                viewerId={viewer.id}
                moderation={
                  <ModerationActions
                    submission={submission}
                    contestId={id}
                    isAdmin
                    isMine={submission.author.id === viewer.id}
                    isCompleted={contest.phase === Phase.Completed}
                  />
                }
              />
            ))}
          </section>
        ) : null}
      </div>
      {contest.phase === Phase.Submission ? (
        <StickyCta>
          <Button fullWidth disabled={Boolean(contest.mySubmissionId)} onClick={handleSubmitPhoto}>
            {contest.mySubmissionId ? '사진 제출 완료' : '사진 제출하기'}
          </Button>
        </StickyCta>
      ) : null}
    </div>
  );
}
