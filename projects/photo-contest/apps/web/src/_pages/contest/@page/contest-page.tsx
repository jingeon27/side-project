'use client';
import Link from 'next/link';
import { useQuery, skipToken } from '@apollo/client/react';
import { useState } from 'react';
import { ArrowLeft, Clock, ShieldCheck, Trophy } from 'lucide-react';
import {
  ContestDocument,
  MeDocument,
  MorePhotosDocument,
  Phase,
  ResultsDocument,
} from '@/shared/api/generated';
import { Login } from '@/features/auth/login';
import { UploadPhoto } from '@/features/contest/upload-photo';
import { PhotoCard } from '@/features/contest/photo-card';
import { EmptyState, ErrorNotice, LoadingState } from '@/shared/ui/states';
import { Button } from '@/shared/ui/button';
import { formatDate, phaseLabel } from '@/shared/lib/format';
export function ContestPage({ id }: { id: string }) {
  const me = useQuery(MeDocument);
  const contest = useQuery(ContestDocument, {
    variables: { id },
    skip: !me.data?.me,
    ssr: false,
    fetchPolicy: 'cache-and-network',
    pollInterval: 15_000,
  });
  const completed = contest.data?.contest.phase === Phase.Completed;
  const results = useQuery(
    ResultsDocument,
    completed
      ? { variables: { contestId: id }, ssr: false, fetchPolicy: 'cache-and-network', pollInterval: 30_000 }
      : skipToken,
  );
  const [offset, setOffset] = useState(0);
  const more = useQuery(
    MorePhotosDocument,
    contest.data && !completed
      ? {
          variables: { contestId: id, offset: 0, limit: 24 },
          ssr: false,
          fetchPolicy: 'cache-and-network',
          pollInterval: offset === 0 ? 15_000 : 0,
        }
      : skipToken,
  );
  const [moreError, setMoreError] = useState('');
  async function handleMore() {
    setMoreError('');
    try {
      await more.fetchMore({ variables: { offset: offset || 24, limit: 24 } });
      setOffset((v) => (v || 24) + 24);
    } catch {
      setMoreError('사진을 더 불러오지 못했습니다. 다시 시도해 주세요.');
    }
  }
  if (me.loading || (contest.loading && !contest.data)) return <LoadingState />;
  if (me.error)
    return (
      <ErrorNotice
        retry={() => {
          void me.refetch();
        }}
      />
    );
  if (!me.data?.me) return <Login />;
  if (contest.error || !contest.data)
    return (
      <ErrorNotice
        message={contest.error?.message ?? '대회를 찾을 수 없습니다.'}
        retry={() => {
          void contest.refetch();
        }}
      />
    );
  const c = contest.data.contest;
  const photos = completed
    ? (results.data?.contestResults.map((r) => r.submission) ?? [])
    : (more.data?.submissions ?? c.submissions);
  const winners = new Set(results.data?.contestResults.filter((r) => r.winner).map((r) => r.submission.id));
  return (
    <>
      <Link className="back-link" href={`/groups/${c.groupId}`}>
        <ArrowLeft size={16} />
        그룹으로 돌아가기
      </Link>
      <section className="contest-heading">
        <span className={`status status-${c.phase.toLowerCase()}`}>{phaseLabel(c.phase)}</span>
        <h1>{c.title}</h1>
        <p className="muted">
          {c.phase === Phase.Submission
            ? '갤러리 속 숨겨둔 한 장, 지금 꺼내볼까요?'
            : c.phase === Phase.Voting
              ? '가장 웃긴 사진에 한 표! 결과는 대회가 끝나면 공개돼요.'
              : completed
                ? '우리끼리 뽑은 최고의 순간. 다음 대회에서 또 만나요!'
                : '곧 대회가 시작돼요. 웃긴 사진을 준비해 두세요.'}
        </p>
        <div className="deadlines">
          <span>
            <Clock size={15} />
            시작 {formatDate(c.startsAt)}
          </span>
          <span>사진 마감 {formatDate(c.submissionEndsAt)}</span>
          <span>투표 마감 {formatDate(c.endsAt)}</span>
        </div>
      </section>
      {c.phase === Phase.Submission && (
        <div className="action-panel">
          <div>
            <h3>
              {c.mySubmissionId
                ? '사진 제출 완료! 친구들의 사진을 기다려요.'
                : '이번 대회의 주인공이 되어보세요'}
            </h3>
            <p className="muted small">한 사람당 사진 한 장. 제출이 끝나면 투표가 시작됩니다.</p>
          </div>
          {!c.mySubmissionId && <UploadPhoto contestId={id} />}
        </div>
      )}
      {c.phase === Phase.Voting && c.myVoteId && (
        <div className="notice success" role="status">
          투표 완료! 대회가 끝나면 결과를 확인해 주세요.
        </div>
      )}
      {completed && (
        <div className="result-banner">
          <Trophy size={30} />
          <div>
            <h2>
              {winners.size
                ? winners.size > 1
                  ? '함께 웃겼다면, 함께 우승!'
                  : '이번 대회 최고의 웃음!'
                : '이번 대회는 우승작 없이 마무리됐어요'}
            </h2>
            <p>
              {winners.size
                ? '동점은 공동 우승 · 모든 참여가 우리의 추억이에요.'
                : '유효한 표를 받은 사진이 없어요. 다음 대회에서 다시 만나요.'}
            </p>
          </div>
        </div>
      )}
      <section className="section">
        <div className="section-heading">
          <h2>
            {completed ? '대회 결과' : '모인 순간들'} <span className="count">{photos.length}</span>
          </h2>
          <span className="row muted small">
            <ShieldCheck size={15} />
            그룹 멤버에게만 공개
          </span>
        </div>
        {completed && results.loading && !results.data ? (
          <LoadingState />
        ) : completed && results.error ? (
          <ErrorNotice
            message={results.error.message}
            retry={() => {
              void results.refetch();
            }}
          />
        ) : !photos.length ? (
          <EmptyState
            title="아직 모인 사진이 없어요"
            description={
              c.phase === Phase.Submission
                ? '첫 번째 사진으로 대회를 시작해보세요.'
                : '다음 대회에서는 사진을 한 장씩 모아봐요.'
            }
          />
        ) : (
          <div className="photo-grid">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                contestId={id}
                phase={c.phase}
                myVoteId={c.myVoteId}
                userId={me.data.me!.id}
                admin={c.isAdmin}
                winner={winners.has(photo.id)}
              />
            ))}
          </div>
        )}
        {!completed && photos.length >= (offset || 24) && (
          <div className="load-more">
            <Button variant="secondary" disabled={more.loading} onClick={handleMore}>
              사진 더 보기
            </Button>
          </div>
        )}
        {moreError && <ErrorNotice message={moreError} />}
      </section>
      {completed && c.isAdmin && c.submissions.some((photo) => photo.hidden) && (
        <section className="section">
          <div className="section-heading">
            <div>
              <h2>숨긴 사진 관리</h2>
              <p className="muted small">관리자에게만 표시되며 대회 결과에서는 제외됩니다.</p>
            </div>
          </div>
          <div className="photo-grid">
            {c.submissions
              .filter((photo) => photo.hidden)
              .map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  contestId={id}
                  phase={c.phase}
                  myVoteId={c.myVoteId}
                  userId={me.data.me!.id}
                  admin
                />
              ))}
          </div>
        </section>
      )}
    </>
  );
}
