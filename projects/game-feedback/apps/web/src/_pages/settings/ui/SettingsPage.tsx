'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { overlay } from 'overlay-kit';
import { Gamepad2, Plus, LogOut, Trash2, ShieldBan, ArrowUpRight, Globe2 } from 'lucide-react';
import { useSession, useLogout } from '@/features/auth';
import { gameAccountListOptions, ProfileSnapshot } from '@/features/game-profile';
import { blockListOptions, useUnblockUser, UserBadges } from '@/features/user';
import { TestAccountPicker } from '@/widgets/authentication';
import { ConnectProfile } from '@/widgets/game-profile';
import { Avatar, ErrorNotice, LoadingState, Modal } from '@/shared/ui';
import { DeleteAccountDialog } from './DeleteAccountDialog';

interface ISettingsPageProps {
  locale: string;
}
function openProfileConnection() {
  overlay.open(({ isOpen, close, unmount }) => (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        close();
        unmount();
      }}
      title="게임 프로필 연결"
      description="플레이어 태그로 현재 덱과 트로피를 확인해요."
    >
      <ConnectProfile
        onSaved={() => {
          close();
          unmount();
        }}
      />
    </Modal>
  ));
}
function openAccountDeletion() {
  overlay.open(({ isOpen, close, unmount }) => (
    <DeleteAccountDialog
      open={isOpen}
      onClose={() => {
        close();
        unmount();
      }}
    />
  ));
}
export function SettingsPage({ locale }: ISettingsPageProps) {
  const { session, login, loading } = useSession();
  const accounts = useQuery(gameAccountListOptions(session?.user?.id));
  const blocks = useQuery(blockListOptions(session?.user?.id));
  const logout = useLogout();
  const unblock = useUnblockUser();
  if (loading) return <LoadingState />;
  if (!session?.user)
    return (
      <div className="empty-feed">
        <span>
          <Gamepad2 size={30} />
        </span>
        <h1>나의 플레이 공간</h1>
        <p>로그인하고 게임 프로필과 계정을 관리하세요.</p>
        <button className="button dark" onClick={login}>
          로그인 / 시작하기
          <ArrowUpRight size={16} />
        </button>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <span className="section-eyebrow">MY PLAYER</span>
        <h1>나의 플레이 공간</h1>
        <p>프로필부터 계정까지, 필요한 설정을 한곳에서.</p>
      </div>
      <section className="settings-card">
        <div className="settings-profile">
          <Avatar name={session.user.nickname} size="large" />
          <div>
            <h2>{session.user.nickname}</h2>
            <UserBadges author={session.user} />
            <p>{new Date(session.user.createdAt).toLocaleDateString('ko-KR')}부터 함께 플레이 중</p>
          </div>
          <span className="status-pill resolved">
            {session.user.role === 'ADMIN' ? '운영자' : '플레이어'}
          </span>
        </div>
      </section>
      {session.demoMode && (
        <section className="settings-card demo-switch-card">
          <TestAccountPicker mode="switch" />
        </section>
      )}
      <section className="settings-card">
        <div className="section-title-row">
          <h2>
            <Gamepad2 size={20} />
            게임 프로필
          </h2>
          <button className="text-button" onClick={openProfileConnection}>
            <Plus size={16} />
            프로필 연결
          </button>
        </div>
        <p className="muted small">
          프로필을 연결하면 피드백 요청에 현재 덱과 트로피를 첨부할 수 있어요. 계정 소유권은 인증되지
          않습니다.
        </p>
        {accounts.isPending && <LoadingState />}
        <ErrorNotice message={accounts.error?.message} />
        {accounts.data?.map((profile) => (
          <ProfileSnapshot key={profile.playerTag} profile={profile} />
        ))}
        {accounts.data?.length === 0 && <ConnectProfile />}
      </section>
      <section className="settings-card">
        <div className="section-title-row">
          <h2>
            <ShieldBan size={19} />
            차단한 사용자
          </h2>
          <span className="small muted">{blocks.data?.length ?? 0}명</span>
        </div>
        <ErrorNotice message={blocks.error?.message ?? unblock.error?.message} />
        {blocks.data?.length === 0 && <p className="muted small">차단한 사용자가 없어요.</p>}
        {blocks.data?.map((person) => (
          <div className="blocked-user" key={person.id}>
            <Avatar name={person.nickname} size="small" />
            <strong>{person.nickname}</strong>
            <UserBadges author={person} compact />
            <button
              className="button outline small-button"
              disabled={unblock.isPending}
              onClick={() => unblock.mutate({ userId: person.id })}
            >
              차단 해제
            </button>
          </div>
        ))}
      </section>
      <section className="settings-card">
        <h2>
          <Globe2 size={19} />
          언어
        </h2>
        <p className="muted small">현재 한국어를 우선 지원해요. 다른 언어는 번역 준비 중입니다.</p>
        <div className="locale-links">
          <Link href="/ko" className={locale === 'ko' ? 'active' : ''}>
            한국어
          </Link>
          <Link href="/en">English · 준비 중</Link>
          <Link href="/ja">日本語 · 準備中</Link>
        </div>
      </section>
      <section className="settings-card account-settings">
        <h2>계정 관리</h2>
        <ErrorNotice message={logout.error?.message} />
        <button className="settings-action" disabled={logout.isPending} onClick={() => logout.mutate()}>
          <LogOut size={18} />
          <span>로그아웃</span>
          <ArrowUpRight size={16} />
        </button>
        <button className="settings-action danger-text" onClick={openAccountDeletion}>
          <Trash2 size={18} />
          <span>회원 탈퇴</span>
          <ArrowUpRight size={16} />
        </button>
      </section>
    </>
  );
}
