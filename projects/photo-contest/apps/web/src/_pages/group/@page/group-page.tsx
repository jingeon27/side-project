'use client';
import Link from 'next/link';
import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, Copy, Users, Trophy } from 'lucide-react';
import { GroupDocument, MeDocument, Phase } from '@/shared/api/generated';
import { CreateContest } from '@/features/contest/create-contest';
import { Login } from '@/features/auth/login';
import { Button } from '@/shared/ui/button';
import { EmptyState, ErrorNotice, LoadingState } from '@/shared/ui/states';
import { formatDate, phaseLabel } from '@/shared/lib/format';
export function GroupPage({ id }: { id: string }) {
  const me = useQuery(MeDocument);
  const { data, loading, error, refetch } = useQuery(GroupDocument, {
    variables: { id },
    skip: !me.data?.me,
    ssr: false,
    fetchPolicy: 'cache-and-network',
    pollInterval: 30_000,
  });
  const [copyMessage, setCopyMessage] = useState('');
  async function handleCopy() {
    if (!data?.group.inviteToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${data.group.inviteToken}`);
      setCopyMessage('초대 링크를 복사했어요!');
    } catch {
      setCopyMessage('복사하지 못했습니다. 아래 링크를 직접 복사해 주세요.');
    }
  }
  if (me.loading || (loading && !data)) return <LoadingState />;
  if (me.error)
    return (
      <ErrorNotice
        retry={() => {
          void me.refetch();
        }}
      />
    );
  if (!me.data?.me) return <Login />;
  if (error || !data)
    return (
      <ErrorNotice
        message={error?.message ?? '그룹을 찾을 수 없습니다.'}
        retry={() => {
          void refetch();
        }}
      />
    );
  const group = data.group;
  const active = group.contests.filter((c) => c.phase !== Phase.Completed);
  const history = group.contests.filter((c) => c.phase === Phase.Completed);
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />내 그룹
      </Link>
      <section className="group-banner">
        <div>
          <span className="eyebrow">OUR PRIVATE CLUB</span>
          <h1>{group.name}</h1>
          <p className="row muted">
            <Users size={17} />
            {group.members.length}명의 웃음 메이트 ·{' '}
            {group.role === 'OWNER' ? '내가 만든 그룹' : '함께하는 그룹'}
          </p>
        </div>
        <span className="banner-art" aria-hidden>
          ✳
        </span>
      </section>
      {group.inviteToken && (
        <section className="invite-panel">
          <div>
            <h3>친구가 많을수록 웃음도 커져요</h3>
            <p className="muted small">
              초대 링크를 아는 사람은 누구나 가입할 수 있어요. 친구에게만 공유해 주세요.
            </p>
          </div>
          <Button variant="secondary" onClick={handleCopy}>
            <Copy size={16} />
            초대 링크 복사
          </Button>
          {copyMessage && (
            <p className="small" role="status">
              {copyMessage}
            </p>
          )}
          <input
            aria-label="그룹 초대 링크"
            className="invite-url"
            readOnly
            value={
              typeof window === 'undefined'
                ? `/invite/${group.inviteToken}`
                : `${window.location.origin}/invite/${group.inviteToken}`
            }
          />
        </section>
      )}
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LET’S PLAY</span>
            <h2>
              진행 중인 대회 <span className="count">{active.length}</span>
            </h2>
          </div>
          {group.role === 'OWNER' && <CreateContest groupId={id} />}
        </div>
        {!active.length ? (
          <EmptyState
            title="다음 웃음을 기다리고 있어요"
            description={
              group.role === 'OWNER'
                ? '새 대회를 열고 친구들의 사진을 모아보세요.'
                : '그룹 관리자가 대회를 열면 참여할 수 있어요.'
            }
          />
        ) : (
          <div className="contest-list">
            {active.map((contest) => (
              <Link className="contest-link" href={`/contests/${contest.id}`} key={contest.id}>
                <div className="contest-symbol">☺</div>
                <div className="grow">
                  <span className={`status status-${contest.phase.toLowerCase()}`}>
                    {phaseLabel(contest.phase)}
                  </span>
                  <h3>{contest.title}</h3>
                  <p className="muted small">
                    사진 마감 {formatDate(contest.submissionEndsAt)} · 투표 마감 {formatDate(contest.endsAt)}
                  </p>
                </div>
                <ArrowUpRight size={23} />
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HALL OF LAUGHS</span>
            <h2>지난 대회 기록</h2>
          </div>
          <Trophy className="muted" size={24} />
        </div>
        {!history.length ? (
          <EmptyState
            title="아직 우승 기록이 없어요"
            description="첫 대회가 끝나면 이곳에 우리들의 순간이 쌓여요."
          />
        ) : (
          <div className="contest-list">
            {history.map((contest) => (
              <Link className="contest-link" href={`/contests/${contest.id}`} key={contest.id}>
                <span className="contest-symbol trophy">🏆</span>
                <div className="grow">
                  <h3>{contest.title}</h3>
                  <p className="muted small">{formatDate(contest.endsAt)} 종료</p>
                </div>
                <span className="small">결과 보기</span>
                <ArrowUpRight size={20} />
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="section members-section">
        <h2>함께하는 친구들</h2>
        <div className="member-list">
          {group.members.map((member) => (
            <div className="member" key={member.user.id}>
              <span className="avatar">{member.user.nickname.slice(0, 1)}</span>
              <span>{member.user.nickname}</span>
              {member.role === 'OWNER' && <span className="mini-badge">관리자</span>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
