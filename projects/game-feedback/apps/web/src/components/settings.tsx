'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listGameAccounts, listBlocks, unblockUser, logout, deleteAccount } from '@game-feedback/sdk';
import { Gamepad2, Plus, LogOut, Trash2, ShieldBan, ArrowUpRight, Globe2 } from 'lucide-react';
import { Avatar, ErrorNotice, Modal, Field, useSession } from './providers';
import { ConnectProfile, ProfileSnapshot } from './game-profile';
import { TestAccountPicker } from './test-account-picker';
import { UserBadges } from './user-badges';
import Link from 'next/link';
export function Settings({ locale }: { locale: string }) {
  const { session, login, notify } = useSession(),
    queryClient = useQueryClient();
  const [adding, setAdding] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState('');
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listGameAccounts(),
    enabled: !!session?.user,
  });
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: () => listBlocks(), enabled: !!session?.user });
  async function act(kind: string, id?: string) {
    setError('');
    setPending(kind);
    try {
      if (kind === 'logout') {
        await logout();
        notify('로그아웃했어요. 다음 플레이에서 만나요!');
      } else if (kind === 'delete') {
        await deleteAccount();
        setDeleting(false);
        notify('회원 탈퇴가 완료되었어요.');
      } else if (id) {
        await unblockUser(id);
        notify('차단을 해제했어요.');
      }
      if (kind === 'logout' || kind === 'delete') await queryClient.resetQueries();
      else await queryClient.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending('');
    }
  }
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
          <button className="text-button" onClick={() => setAdding(!adding)}>
            <Plus size={16} />
            프로필 연결
          </button>
        </div>
        <p className="muted small">
          프로필을 연결하면 피드백 요청에 현재 덱과 트로피를 첨부할 수 있어요. 계정 소유권은 인증되지
          않습니다.
        </p>
        {accounts.isError && <ErrorNotice message={accounts.error.message} />}
        {accounts.data?.map((profile) => (
          <ProfileSnapshot key={profile.playerTag} profile={profile} />
        ))}
        {(adding || accounts.data?.length === 0) && <ConnectProfile onSaved={() => setAdding(false)} />}
      </section>
      <section className="settings-card">
        <div className="section-title-row">
          <h2>
            <ShieldBan size={19} />
            차단한 사용자
          </h2>
          <span className="small muted">{blocks.data?.length || 0}명</span>
        </div>
        {blocks.isError && <ErrorNotice message={blocks.error.message} />}
        {blocks.data?.length === 0 && <p className="muted small">차단한 사용자가 없어요.</p>}
        {blocks.data?.map((person) => (
          <div className="blocked-user" key={person.id}>
            <Avatar name={person.nickname} size="small" />
            <strong>{person.nickname}</strong>
            <UserBadges author={person} compact />
            <button
              className="button outline small-button"
              disabled={!!pending}
              onClick={() => act('unblock', person.id)}
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
        <ErrorNotice message={deleting ? '' : error} />
        <button className="settings-action" disabled={!!pending} onClick={() => act('logout')}>
          <LogOut size={18} />
          <span>로그아웃</span>
          <ArrowUpRight size={16} />
        </button>
        <button
          className="settings-action danger-text"
          onClick={() => {
            setError('');
            setDeleting(true);
          }}
        >
          <Trash2 size={18} />
          <span>회원 탈퇴</span>
          <ArrowUpRight size={16} />
        </button>
      </section>
      <Modal
        open={deleting}
        onOpenChange={setDeleting}
        title="플레이메이트를 떠나시겠어요?"
        description="계정과 연결된 게임 프로필, 작성한 콘텐츠가 삭제됩니다. 이 작업은 되돌릴 수 없어요."
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act('delete');
          }}
        >
          <Field label="계속하려면 '탈퇴'를 입력해 주세요">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="탈퇴" required />
          </Field>
          <ErrorNotice message={error} />
          <button className="button danger full" disabled={confirm !== '탈퇴' || !!pending}>
            계정 영구 삭제하기
          </button>
          <button className="button outline full" type="button" onClick={() => setDeleting(false)}>
            계속 함께하기
          </button>
        </form>
      </Modal>
    </>
  );
}
