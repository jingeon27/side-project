'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listConversations } from '@game-feedback/sdk';
import { useChatConnection } from './chat-realtime';
import {
  Gamepad2,
  MessageCircle,
  Bell,
  ArrowUpRight,
  ChevronRight,
  MessageSquareText,
  Settings2,
  Sparkles,
  Crown,
  Shield,
  Trophy,
  CircleHelp,
  Plus,
  Home,
  Globe2,
} from 'lucide-react';
import { useSession, Avatar } from './providers';
import { api, type GameProfile, type NotificationList } from '@/lib/api';
import { UserBadges } from './user-badges';
export function Shell({ children, locale }: { children: React.ReactNode; locale: string }) {
  const { session, login } = useSession(),
    path = usePathname();
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<GameProfile[]>('/me/game-accounts'),
    enabled: !!session?.user,
  });
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationList>('/notifications'),
    enabled: !!session?.user,
    refetchInterval: 30_000,
  });
  const connection = useChatConnection();
  const { data: conversations } = useQuery({
    queryKey: ['chat', session?.user?.id, 'conversations', 'badge'],
    queryFn: () => listConversations({ limit: 1 }),
    enabled: !!session?.user,
    refetchInterval: connection === 'live' ? false : 10_000,
    staleTime: 0,
  });
  const chatUnread = conversations?.unreadCount || 0;
  const unread = notifications?.unreadCount || 0;
  const home = `/${locale}`,
    isHome = path === home;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href={home} className="brand" aria-label="플레이메이트 홈">
            <span className="brand-mark">
              <Gamepad2 size={24} strokeWidth={2.5} />
            </span>
            <span>
              플레이메이트<span className="alpha-tag">ALPHA</span>
            </span>
          </Link>
          <nav className="top-nav" aria-label="주 메뉴">
            <Link href={home} className={isHome ? 'active' : ''}>
              피드백 라운지
            </Link>
            <Link href={`${home}/guide`} className={path.endsWith('/guide') ? 'active' : ''}>
              이용 가이드
              <ArrowUpRight size={13} />
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              className="icon-button notification-button"
              aria-label={`채팅 ${chatUnread}개`}
              href={`${home}/messages`}
            >
              <MessageCircle size={21} />
              {chatUnread > 0 && (
                <span className="header-chat-count">{chatUnread > 99 ? '99+' : chatUnread}</span>
              )}
            </Link>
            <Link
              className="icon-button notification-button"
              aria-label={`알림 ${unread}개`}
              href={`${home}/notifications`}
            >
              <Bell size={21} />
              {unread > 0 && <span className="notification-dot" />}
            </Link>
            {session?.user ? (
              <Link href={`${home}/settings`} className="user-button">
                <Avatar name={session.user.nickname} size="small" />
                <span>{session.user.nickname}</span>
              </Link>
            ) : (
              <button className="button dark small-button" onClick={login}>
                로그인 / 시작하기
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>
      </header>
      {locale !== 'ko' && (
        <div className="language-banner">
          <Globe2 size={16} />
          <span>
            {locale === 'ja'
              ? '日本語の翻訳は準備中です。アルファ版は韓国語で提供しています。'
              : 'English translation is in progress. This alpha is currently available in Korean.'}
          </span>
          <Link href="/ko">한국어로 보기</Link>
        </div>
      )}
      <div className={`site-grid ${path.endsWith('/messages') ? 'chat-layout' : ''}`}>
        <aside className="left-sidebar">
          <div className="sidebar-label">둘러보기</div>
          <Link className={`side-link ${isHome ? 'selected' : ''}`} href={home}>
            <MessageSquareText size={19} />
            전체 피드백
            <ChevronRight size={16} />
          </Link>
          <Link
            className={`side-link ${path.endsWith('/notifications') ? 'selected' : ''}`}
            href={`${home}/notifications`}
          >
            <Bell size={19} />내 알림{unread > 0 && <span className="count-badge">{unread}</span>}
          </Link>
          <Link
            className={`side-link ${path.endsWith('/messages') ? 'selected' : ''}`}
            href={`${home}/messages`}
          >
            <MessageCircle size={19} />
            채팅{chatUnread > 0 && <span className="count-badge">{chatUnread}</span>}
          </Link>
          <div className="sidebar-separator" />
          <div className="sidebar-label">나의 게임</div>
          <Link className="game-side-link" href={home}>
            <span className="game-icon">
              <Crown size={23} />
            </span>
            <span>
              <strong>클래시 로얄</strong>
              <small>Clash Royale</small>
            </span>
            <span className="live-dot" />
          </Link>
          <div className="upcoming-games">
            <span>다음 게임을 기다리고 있나요?</span>
            <span>더 많은 게임이 찾아올 예정이에요.</span>
          </div>
          <div className="sidebar-bottom">
            <div className="community-caption">
              <span className="tiny-sparkle">✳</span>
              <strong>
                좋은 피드백이
                <br />
                다음 플레이를 만듭니다.
              </strong>
            </div>
            <p>경험을 나누고, 함께 성장해요.</p>
            <div className="sidebar-footer-links">
              <Link href={`${home}/terms`}>이용약관</Link>
              <Link href={`${home}/privacy`}>개인정보</Link>
              <Link href={`${home}/contact`}>문의</Link>
            </div>
            <span className="copyright">© 2026 PLAYMATE</span>
          </div>
        </aside>
        <main className="main-content">{children}</main>
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
                <button className="button primary full" onClick={login}>
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
      </div>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <Link href={home} className={isHome ? 'active' : ''}>
          <Home size={20} />
          <span>라운지</span>
        </Link>
        <Link href={`${home}/messages`} className={path.endsWith('/messages') ? 'active' : ''}>
          <MessageCircle size={20} />
          <span>채팅{chatUnread > 0 && <span className="mobile-chat-dot" />}</span>
        </Link>
        <Link href={`${home}/notifications`}>
          <Bell size={20} />
          <span>알림</span>
        </Link>
        <Link href={`${home}/settings`}>
          <Settings2 size={20} />
          <span>내 프로필</span>
        </Link>
        <Link href={`${home}/guide`}>
          <CircleHelp size={20} />
          <span>가이드</span>
        </Link>
      </nav>
    </>
  );
}
