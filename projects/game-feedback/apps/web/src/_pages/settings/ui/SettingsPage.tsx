'use client';
import { useI18n } from '@/shared/i18n';
import { formatDate } from '@/shared/lib/date';
import { Button } from '@side/design-system';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2, Plus, LogOut, Trash2, ShieldBan, ArrowUpRight } from 'lucide-react';
import { useSession, useLogout } from '@/features/auth';
import { gameAccountListOptions, ProfileSnapshot } from '@/features/game-profile';
import { blockListOptions, useUnblockUser, UserBadges } from '@/features/user';
import { SupportChatButton } from '@/widgets/support';
import { ConnectProfile } from '@/widgets/game-profile';
import { openOverlay, Avatar, ErrorNotice, LoadingState, BottomSheet } from '@/shared/ui';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { LanguageSettings } from './LanguageSettings';
import { ThemeSettings } from './ThemeSettings';

interface ISettingsPageProps {
  locale: string;
}
function openProfileConnection(t: (message: string) => string) {
  openOverlay(({ isOpen, close, unmount }) => (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        close();
        unmount();
      }}
      title={t('게임 계정 등록')}
      description={t('플레이어 태그로 트로피와 아레나를 확인해요.')}
    >
      <ConnectProfile
        onSaved={() => {
          close();
          unmount();
        }}
      />
    </BottomSheet>
  ));
}
function openAccountDeletion() {
  openOverlay(({ isOpen, close, unmount }) => (
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
  const { t, locale: textLocale } = useI18n();
  const { session, login, loading } = useSession();
  const accounts = useQuery(gameAccountListOptions(session?.user?.id));
  const blocks = useQuery(blockListOptions(session?.user?.id));
  const logout = useLogout();
  const unblock = useUnblockUser();
  if (loading) return <LoadingState />;
  if (!session?.user)
    return (
      <>
        <LanguageSettings />
        <ThemeSettings />
        <div className="empty-feed">
          <span>
            <Gamepad2 size={30} />
          </span>
          <h1>{t('나의 플레이 공간')}</h1>
          <p>{t('로그인하고 게임 프로필과 계정을 관리하세요.')}</p>
          <Button variant="primary" size="md" type="submit" className="button dark" onClick={login}>
            {t('로그인 / 시작하기')}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <h1>{t('나의 플레이 공간')}</h1>
        <p>{t('프로필부터 계정까지, 필요한 설정을 한곳에서.')}</p>
      </div>
      <section className="settings-card">
        <div className="settings-profile">
          <Avatar name={session.user.nickname} size="large" />
          <div>
            <h2>{session.user.nickname}</h2>
            <UserBadges author={session.user} />
            <p>
              {t('{date}부터 함께 플레이 중', {
                date: formatDate(session.user.createdAt, textLocale),
              })}
            </p>
            <Link className="text-button" href={`/${locale}/users/${session.user.id}`}>
              {t('공개 프로필 보기 →')}
            </Link>
          </div>
          <span className="status-pill resolved">
            {session.user.role === 'ADMIN' ? t('운영자') : t('플레이어')}
          </span>
        </div>
      </section>
      <section className="settings-card">
        <div className="section-title-row">
          <h2>
            <Gamepad2 size={20} />
            {t('게임 계정')}
          </h2>
          <button className="text-button" onClick={() => openProfileConnection(t)}>
            <Plus size={16} />
            {t('계정 등록')}
          </button>
        </div>
        <p className="muted small">
          {t('게임 계정은 내 사용자 계정에 등록됩니다. 프로필 인증은 관리자에게 문의해주세요.')}
        </p>
        {accounts.isPending && <LoadingState />}
        <ErrorNotice message={accounts.error?.message} />
        {accounts.data?.map((profile) => (
          <ProfileSnapshot key={profile.playerTag} profile={profile} />
        ))}
      </section>
      <section className="settings-card">
        <div className="section-title-row">
          <h2>
            <ShieldBan size={19} />
            {t('차단한 사용자')}
          </h2>
          <span className="small muted">
            {blocks.data?.length ?? 0}
            {t('명')}
          </span>
        </div>
        <ErrorNotice message={blocks.error?.message ?? unblock.error?.message} />
        {blocks.data?.length === 0 && <p className="muted small">{t('차단한 사용자가 없어요.')}</p>}
        {blocks.data?.map((person) => (
          <div className="blocked-user" key={person.id}>
            <Avatar name={person.nickname} size="small" />
            <strong>{person.nickname}</strong>
            <UserBadges author={person} compact />
            <Button
              variant="secondary"
              size="sm"
              type="submit"
              className="button outline small-button"
              disabled={unblock.isPending}
              onClick={() => unblock.mutate({ userId: person.id })}
            >
              {t('차단 해제')}
            </Button>
          </div>
        ))}
      </section>
      <section className="settings-card form-stack">
        <h2>{t('인증과 문의')}</h2>
        {session.user.bannedAt && (
          <p role="alert">
            {t('이용 제한 중')}: {session.user.banReason}
          </p>
        )}
        <SupportChatButton topic="VERIFICATION" />
        <SupportChatButton />
        {session.user.role === 'ADMIN' && process.env.NEXT_PUBLIC_GAME_FEEDBACK_LOCAL_ADMIN === 'true' && (
          <Link className="text-button" href={`/${locale}/admin`}>
            {t('운영 관리')}
          </Link>
        )}
      </section>
      <LanguageSettings />
      <ThemeSettings />
      <section className="settings-card account-settings">
        <h2>{t('계정 관리')}</h2>
        <ErrorNotice message={logout.error?.message} />
        <button className="settings-action" disabled={logout.isPending} onClick={() => logout.mutate()}>
          <LogOut size={18} />
          <span>{t('로그아웃')}</span>
          <ArrowUpRight size={16} />
        </button>
        <button className="settings-action danger-text" onClick={openAccountDeletion}>
          <Trash2 size={18} />
          <span>{t('회원 탈퇴')}</span>
          <ArrowUpRight size={16} />
        </button>
      </section>
    </>
  );
}
