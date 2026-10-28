'use client';

import {
  skipToken,
  useBackgroundQuery,
  useFragment,
  useQuery,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';
import { Trophy } from 'lucide-react';
import { match } from 'ts-pattern';

import { GroupContestVoteButton, PhaseBadge } from '@/features/contest';
import { GroupContentFrame, GroupMembershipButton } from '@/features/group';
import { CreatePostButton, LatestPosts, PostCard, PostsEmptyState } from '@/features/post';
import {
  GroupContestDocument,
  GroupContestResultsDocument,
  GroupContestSummaryFragmentDoc,
  Phase,
  type GroupContestQuery,
  type GroupContestResultsQuery,
} from '@/shared/api/generated';
import { formatDateTime } from '@/shared/lib/format.helper';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { NotificationBell } from '@/widgets/notification-bell';

function ContestPhaseSync({ id, phase }: { id: string; phase: Phase }) {
  useQuery(
    GroupContestDocument,
    phase !== Phase.Completed
      ? { variables: { id }, pollInterval: 30_000, errorPolicy: 'all', notifyOnNetworkStatusChange: false }
      : skipToken,
  );
  return null;
}
function ContestHeader({ id }: { id: string }) {
  const { data: contest, complete } = useFragment({
    fragment: GroupContestSummaryFragmentDoc,
    from: { __typename: 'GroupContest', id },
  });
  if (!complete) return null;
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 tablet:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PhaseBadge phase={contest.phase} />
        <span className="text-caption text-muted">참여작 {contest.entryCount}개</span>
      </div>
      <h2 className="wrap-break-word text-title-lg text-ink">{contest.title}</h2>
      <p className="text-body text-muted">
        {match(contest.phase)
          .with(Phase.Upcoming, () => '접수 시작을 기다리고 있어요.')
          .with(
            Phase.Submission,
            () => '사진이나 동영상, 합성한 이미지를 게시해 보세요. 게시물을 여러 개 올릴 수 있어요.',
          )
          .with(Phase.Voting, () => '가장 웃긴 참여작에 한 표를 보내세요.')
          .with(Phase.Completed, () => '함께 뽑은 우승작과 최종 결과를 확인하세요.')
          .exhaustive()}
      </p>
      <dl className="grid grid-cols-1 gap-3 text-caption tablet:grid-cols-3">
        <div>
          <dt className="text-muted">접수 시작</dt>
          <dd className="mt-1 text-ink">{formatDateTime(contest.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">접수 마감</dt>
          <dd className="mt-1 text-ink">{formatDateTime(contest.submissionEndsAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">투표 마감</dt>
          <dd className="mt-1 text-ink">{formatDateTime(contest.endsAt)}</dd>
        </div>
      </dl>
      {contest.canParticipate ? (
        <CreatePostButton groupId={contest.groupId} contestId={id} />
      ) : (
        <GroupMembershipButton groupId={contest.groupId} />
      )}
      <p className="text-caption text-muted">
        좋아요는 한 사람당 최대 {contest.likeLimit}개 작품에 누를 수 있어요.
      </p>
      <ContestPhaseSync id={id} phase={contest.phase} />
    </section>
  );
}
function Results({ queryRef }: { queryRef: QueryRef<GroupContestResultsQuery> }) {
  const { data } = useReadQuery(queryRef);
  if (!data.groupContestResults.length)
    return (
      <EmptyState title="참여작이 없는 대회예요" description="다음 대회에서 함께 웃긴 순간을 나눠보세요." />
    );
  return (
    <section aria-label="대회 최종 결과" className="mx-auto flex w-full max-w-feed flex-col gap-6">
      {data.groupContestResults.map((result) => (
        <div key={result.post.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-1">
            <span className="flex size-10 items-center justify-center rounded-control bg-ink text-title text-surface">
              {result.rank}
            </span>
            <p className="text-label text-ink">{result.voteCount}표</p>
            {result.winner ? (
              <span className="ml-auto flex items-center gap-2 text-label text-ink">
                <Trophy aria-hidden className="size-5" />
                우승
              </span>
            ) : null}
          </div>
          <PostCard id={result.post.id} />
        </div>
      ))}
    </section>
  );
}
/** 라우트가 결과를 사전 조회했으면 SSR에서도 같은 변수로 읽고, 아니면 브라우저에서 시작한다. */
function ResultQuery({ id, preloaded }: { id: string; preloaded: boolean }) {
  const isSSR = useIsSSR();
  const [queryRef, { refetch }] = useBackgroundQuery(
    GroupContestResultsDocument,
    preloaded || !isSSR ? { variables: { contestId: id } } : skipToken,
  );
  const fallback = <Skeleton className="h-64 w-full" />;
  return (
    <AsyncBoundary fallback={fallback} onRetry={() => refetch()}>
      {queryRef ? <Results queryRef={queryRef} /> : fallback}
    </AsyncBoundary>
  );
}
function ContestContent({
  queryRef,
  groupId,
  resultsPreloaded,
}: {
  queryRef: QueryRef<GroupContestQuery>;
  groupId: string;
  resultsPreloaded: boolean;
}) {
  const { data } = useReadQuery(queryRef);
  const contest = data.groupContest;
  if (contest.groupId !== groupId) return <ErrorState message="이 그룹의 대회를 찾을 수 없습니다." />;
  return (
    <>
      <ContestHeader id={contest.id} />
      {match(contest.phase)
        .with(Phase.Completed, () => <ResultQuery id={contest.id} preloaded={resultsPreloaded} />)
        .with(Phase.Upcoming, Phase.Submission, Phase.Voting, () => (
          <LatestPosts
            groupId={groupId}
            contestId={contest.id}
            title="참여 게시물"
            empty={<PostsEmptyState title="아직 대회에 참여한 게시물이 없어요" />}
            postAction={(postId) => <GroupContestVoteButton contestId={contest.id} postId={postId} />}
          />
        ))
        .exhaustive()}
    </>
  );
}
function ContestQuery({
  id,
  groupId,
  resultsPreloaded,
}: {
  id: string;
  groupId: string;
  resultsPreloaded: boolean;
}) {
  const [queryRef, { refetch }] = useBackgroundQuery(GroupContestDocument, { variables: { id } });
  return (
    <AsyncBoundary fallback={<Skeleton className="h-64 w-full" />} onRetry={() => refetch()}>
      <ContestContent queryRef={queryRef} groupId={groupId} resultsPreloaded={resultsPreloaded} />
    </AsyncBoundary>
  );
}
export function GroupContestPageTemplate({
  id,
  groupId,
  initialTitle = '대회',
  resultsPreloaded = false,
}: {
  id: string;
  groupId: string;
  initialTitle?: string;
  resultsPreloaded?: boolean;
}) {
  const isSSR = useIsSSR();
  const { data: contest, complete } = useFragment({
    fragment: GroupContestSummaryFragmentDoc,
    from: { __typename: 'GroupContest', id },
  });
  return (
    <GroupContentFrame
      groupId={groupId}
      title={!isSSR && complete && contest.groupId === groupId ? contest.title : initialTitle}
      showNavigation={false}
      breadcrumb
      headerActions={<NotificationBell />}
    >
      <ContestQuery id={id} groupId={groupId} resultsPreloaded={resultsPreloaded} />
    </GroupContentFrame>
  );
}
