'use client';

import Link from 'next/link';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Gamepad2, LogOut, Plus, ShieldBan, Trash2 } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { logoutMutationOptions, useSession } from '@/features/auth';
import { gameAccountListOptions } from '@/features/game-profile';
import { blockListOptions, unblockUserMutationOptions, UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { formatDate } from '@/shared/lib/date';
import { ChildLink } from '@/shared/navigation';
import { Avatar, ErrorNotice, LoadingState, openOverlay, useNotify } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';
import { ConnectProfile, GameAccountCard } from '@/widgets/game-profile';
import { SupportChatButton } from '@/widgets/support';

import { DeleteAccountDialog } from './DeleteAccountDialog';
import { LanguageSettings } from './LanguageSettings';
import { MyPosts } from './MyPosts';
import { SettingsTopbar } from './SettingsTopbar';
import { ThemeSettings } from './ThemeSettings';

interface ISettingsPageProps {
  locale: string;
}
function openProfileConnection() {
  openOverlay((control) => <ConnectProfile {...control} onSaved={() => control.onOpenChange(false)} />);
}
function openAccountDeletion() {
  openOverlay((control) => <DeleteAccountDialog {...control} />);
}
function SettingsContent({ locale }: ISettingsPageProps) {
  const client = useQueryClient();
  const notify = useNotify();
  const { t, locale: textLocale } = useI18n();
  const { session, login, loading } = useSession();
  const accounts = useQuery(gameAccountListOptions(session?.user?.id));
  const blocks = useQuery(blockListOptions(session?.user?.id));
  const logout = useMutation(
    logoutMutationOptions(client, () => notify(t('로그아웃했어요. 다음 플레이에서 만나요!'))),
  );
  const unblock = useMutation(unblockUserMutationOptions(client, () => notify(t('차단을 해제했어요.'))));
  const blockError = blocks.error?.message ?? unblock.error?.message;
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
          <Button variant="primary" size="md" type="submit" className="button dark" onClick={() => login()}>
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
          <Avatar src={session.user.avatarUrl} name={session.user.nickname} size="large" />
          <div>
            <h2>{session.user.nickname}</h2>
            <UserBadges author={session.user} />
            <p>
              {t('{date}부터 함께 플레이 중', {
                date: formatDate(session.user.createdAt, textLocale),
              })}
            </p>
            <Link className="text-action" href={`/${locale}/users/${session.user.id}`}>
              {t('공개 프로필 보기 →')}
            </Link>
          </div>
          <span className="status-pill resolved">
            {session.user.role === 'ADMIN' ? t('운영자') : t('플레이어')}
          </span>
        </div>
      </section>
      <MyPosts locale={locale} userId={session.user.id} />
      <section className="settings-card game-accounts" aria-labelledby="game-accounts-title">
        <div className="section-title-row game-accounts-heading">
          <h2 id="game-accounts-title">
            <Gamepad2 size={20} aria-hidden />
            {t('게임 계정')}
          </h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => openProfileConnection()}>
            <Plus size={16} aria-hidden />
            {t('계정 등록')}
          </Button>
        </div>
        <p className="muted small">
          {t('게임 계정은 내 사용자 계정에 등록됩니다. 프로필 인증은 관리자에게 문의해주세요.')}
        </p>
        {accounts.isPending && <LoadingState />}
        <ErrorNotice message={accounts.error && t(accounts.error.message)} />
        <div className="game-account-list">
          {accounts.data?.map((profile) => (
            <GameAccountCard key={profile.playerTag} profile={profile} />
          ))}
        </div>
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
        <ErrorNotice message={blockError && t(blockError)} />
        {blocks.data?.length === 0 && <p className="muted small">{t('차단한 사용자가 없어요.')}</p>}
        {blocks.data?.map((person) => (
          <div className="blocked-user" key={person.id}>
            <Avatar src={person.avatarUrl} name={person.nickname} size="small" />
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
      </section>
      <LanguageSettings />
      <ThemeSettings />
      <section className="settings-card account-settings">
        <h2>{t('계정 관리')}</h2>
        <ErrorNotice message={logout.error && t(logout.error.message)} />
        <button className="settings-action" disabled={logout.isPending} onClick={() => logout.mutate()}>
          <LogOut size={18} />
          <span>{t('로그아웃')}</span>
          <ArrowUpRight size={16} />
        </button>
        <button className="settings-action danger-text" onClick={() => openAccountDeletion()}>
          <Trash2 size={18} />
          <span>{t('회원 탈퇴')}</span>
          <ArrowUpRight size={16} />
        </button>
      </section>
    </>
  );
}

export function SettingsPage(props: Parameters<typeof SettingsContent>[0]) {
  const { t } = useI18n();
  return (
    <CommunityPage locale={props.locale} topbar={<SettingsTopbar locale={props.locale} />}>
      <SettingsContent {...props} />
      <section className="settings-card">
        <h2>{t('서비스 안내')}</h2>
        <ChildLink href={appRoutes.guide(props.locale)} className="settings-action">
          {t('이용 가이드')}
        </ChildLink>
      </section>
    </CommunityPage>
  );
}
