'use client';
import { useQuery } from '@apollo/client/react';
import Link from 'next/link';
import { ArrowUpRight, Users, LockKeyhole, ImagePlus, Trophy } from 'lucide-react';
import { MeDocument, MyGroupsDocument } from '@/shared/api/generated';
import { CreateGroup } from '@/features/group/create-group';
import { Login } from '@/features/auth/login';
import { EmptyState, ErrorNotice, LoadingState } from '@/shared/ui/states';
import { phaseLabel } from '@/shared/lib/format';
export function HomePage() {
  const me = useQuery(MeDocument);
  const groups = useQuery(MyGroupsDocument, {
    skip: !me.data?.me,
    ssr: false,
    fetchPolicy: 'cache-and-network',
  });
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">
            <span className="dot" />
            PRIVATE PHOTO CLUB
          </span>
          <h1>
            카톡에 묻히기엔
            <br />
            너무 <span className="highlight">웃긴 사진들.</span>
          </h1>
          <p>
            친구들끼리 한 장씩, 웃음은 무제한.
            <br />
            우리만의 사진 대회를 열고 최고의 순간을 뽑아보세요.
          </p>
          <div className="hero-tags">
            <span>
              <LockKeyhole size={14} />
              우리끼리만
            </span>
            <span>
              <ImagePlus size={14} />한 사람 한 장
            </span>
            <span>
              <Trophy size={14} />
              함께 뽑는 우승작
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="photo-note note-back">
            <div className="note-picture">✌️</div>
            <span>이 순간, 저장.</span>
          </div>
          <div className="photo-note note-front">
            <div className="note-picture">
              😹<span className="art-spark">✦</span>
            </div>
            <span>이번 주 웃음 금메달 🏅</span>
          </div>
          <span className="art-label">작은 대회, 큰 추억</span>
        </div>
      </section>
      {me.loading ? (
        <LoadingState />
      ) : me.error ? (
        <ErrorNotice
          message="로그인 상태를 확인하지 못했습니다."
          retry={() => {
            void me.refetch();
          }}
        />
      ) : !me.data?.me ? (
        <Login />
      ) : (
        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MY GROUPS</span>
              <h2>나의 웃음 메이트</h2>
              <p className="muted">같이 웃고 싶은 친구들이 모인 곳</p>
            </div>
            <CreateGroup />
          </div>
          {groups.loading && !groups.data ? (
            <LoadingState />
          ) : groups.error ? (
            <ErrorNotice
              message="그룹을 불러오지 못했습니다."
              retry={() => {
                void groups.refetch();
              }}
            />
          ) : !groups.data?.myGroups.length ? (
            <EmptyState
              title="첫 번째 그룹을 만들어보세요"
              description="친구의 초대 링크로 가입하거나 새 그룹을 만들 수 있어요."
            />
          ) : (
            <div className="group-grid">
              {groups.data.myGroups.map((group, index) => (
                <Link href={`/groups/${group.id}`} className="group-card" key={group.id}>
                  <div className={`group-cover cover-${index % 3}`}>
                    <span>{['✳', '☺', '✿'][index % 3]}</span>
                    <ArrowUpRight size={23} />
                  </div>
                  <div className="group-body">
                    <div className="row between">
                      <h3>{group.name}</h3>
                      {group.role === 'OWNER' && <span className="mini-badge">관리자</span>}
                    </div>
                    <p className="row muted small">
                      <Users size={15} />
                      {group.members.length}명의 친구
                    </p>
                    <div className="card-bottom">
                      {group.contests[0] ? (
                        <>
                          <span className={`status status-${group.contests[0].phase.toLowerCase()}`}>
                            {phaseLabel(group.contests[0].phase)}
                          </span>
                          <span className="small truncate">{group.contests[0].title}</span>
                        </>
                      ) : (
                        <span className="muted small">첫 대회를 기다리고 있어요</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="how-it-works">
        <div>
          <span>01</span>
          <h3>우리끼리 모이고</h3>
          <p>초대 링크 하나로 친구들과 연결.</p>
        </div>
        <div>
          <span>02</span>
          <h3>한 장씩 꺼내고</h3>
          <p>갤러리 속 숨겨둔 웃긴 순간을 제출.</p>
        </div>
        <div>
          <span>03</span>
          <h3>최고의 웃음을 뽑고</h3>
          <p>한 표로 응원하고 우승작을 추억.</p>
        </div>
      </section>
    </>
  );
}
