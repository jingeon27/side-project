'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Crown, Settings2, Plus, Gamepad2, ArrowUpRight, Sparkles, Shield } from 'lucide-react';
import { useSession } from '@/features/auth';
import { gameAccountListOptions } from '@/features/game-profile';
import { UserBadges } from '@/features/user';
import { Avatar } from '@/shared/ui';
export function PlayerSidebar({ home }: { home: string }) {
  const { session, login: handleLogin } = useSession();
  const { data: accounts } = useQuery(gameAccountListOptions(session?.user?.id));
  return (
    <aside className="right-sidebar">
      <div className="profile-card">
        <div className="eyebrow">
          <span className="green-dot" />
          MY PLAYER
        </div>
        {session?.user ? (
          <>
            <div className="profile-person">
              <Avatar name={session.user.nickname} size="large" />
              <div>
                <h3>{session.user.nickname}</h3>
                <UserBadges author={session.user} compact />
                <span className="muted small">함께 성장하는 플레이어</span>
              </div>
            </div>
            {accounts?.[0] ? (
              <>
                <div className="profile-game">
                  <span>클래시 로얄</span>
                  <span className="unverified">소유권 미인증</span>
                </div>
                <div className="profile-player-name">
                  {accounts[0].name}
                  <span>{accounts[0].playerTag}</span>
                </div>
                <div className="profile-stats">
                  <div>
                    <Trophy size={16} />
                    <strong>{accounts[0].trophies.toLocaleString()}</strong>
                    <span>트로피</span>
                  </div>
                  <div>
                    <Crown size={16} />
                    <strong>{accounts[0].arena}</strong>
                    <span>아레나</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="profile-intro">게임 프로필을 연결하면 더 구체적인 피드백을 받을 수 있어요.</p>
            )}
            <Link className="button outline full" href={`${home}/settings`}>
              {accounts?.[0] ? <Settings2 size={16} /> : <Plus size={16} />}
              {accounts?.[0] ? '내 프로필 관리' : '게임 프로필 연결'}
            </Link>
          </>
        ) : (
          <>
            <div className="profile-illustration">
              <span className="illustration-ring" />
              <Gamepad2 size={38} />
              <span className="illustration-star">✦</span>
            </div>
            <h3>반가워요, 플레이어님!</h3>
            <p className="profile-intro">
              나의 플레이를 나누고
              <br />
              새로운 시선을 만나보세요.
            </p>
            <button className="button primary full" onClick={handleLogin}>
              함께 시작하기
              <ArrowUpRight size={16} />
            </button>
            <p className="small muted centered">Google 계정으로 간편하게</p>
          </>
        )}
      </div>
      <div className="guide-card">
        <div className="guide-icon">
          <Sparkles size={20} />
        </div>
        <h3>
          좋은 질문이
          <br />
          좋은 피드백의 시작!
        </h3>
        <p>
          사용하는 덱, 고민하는 상황,
          <br />
          궁금한 점을 구체적으로 알려주세요.
        </p>
        <Link href={`${home}/guide`}>
          피드백 요청 가이드
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="community-note">
        <Shield size={17} />
        <div>
          <strong>플레이를 이야기해요, 서로를 존중해요.</strong>
          <p>
            비난보다 제안을, 결과보다 과정을.
            <br />
            건강한 게임 문화를 함께 만들어요.
          </p>
        </div>
      </div>
      <a className="alpha-status" href={`${home}/contact`}>
        <span className="green-dot" />
        <span>지금은 함께 만들어가는 알파 기간</span>
        <ArrowUpRight size={13} />
      </a>
      {session?.demoMode && <div className="demo-badge">데모 환경 · 예시 데이터 포함</div>}
    </aside>
  );
}
