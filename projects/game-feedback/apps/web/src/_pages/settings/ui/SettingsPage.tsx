'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LogOut, Trash2 } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button, StatusAnimation } from '@side/design-system';

import { logoutMutationOptions, useSession } from '@/features/auth';
import { UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { formatDate } from '@/shared/lib/date';
import { ChildLink } from '@/shared/navigation';
import { Avatar, ErrorNotice, openOverlay, useNotify } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';
import { SupportChatButton } from '@/widgets/support';

import { BlockedUsersSection } from './BlockedUsersSection';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { GameAccountsSection } from './GameAccountsSection';
import { LanguageSettings } from './LanguageSettings';
import { MyPosts } from './MyPosts';
import { SettingsTopbar } from './SettingsTopbar';
import { ThemeSettings } from './ThemeSettings';

interface ISettingsPageProps {
  locale: string;
}
const handleOpenAccountDeletion = () => {
  openOverlay((control) => <DeleteAccountDialog {...control} />);
};
function SettingsContent({ locale }: ISettingsPageProps) {
  const client = useQueryClient();
  const notify = useNotify();
  const { t, locale: textLocale } = useI18n();
  const { session, login } = useSession();
  const logout = useMutation(
    logoutMutationOptions(client, () => notify(t('로그아웃했어요. 다음 플레이에서 만나요!'))),
  );
  if (!session?.user)
    return (
      <>
        <LanguageSettings />
        <ThemeSettings />
        <div className="empty-feed">
          <StatusAnimation variant="empty" className="mx-auto mb-3 size-14" />
          <h1>{t('나의 플레이 공간')}</h1>
          <p>{t('로그인하고 게임 프로필과 계정을 관리하세요.')}</p>
          <Button variant="primary" size="md" type="button" className="button" onClick={login}>
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
            <ChildLink className="text-action" href={appRoutes.profile(locale, session.user.id)}>
              {t('공개 프로필 보기 →')}
            </ChildLink>
          </div>
          <span className="status-pill resolved">
            {session.user.role === 'ADMIN' ? t('운영자') : t('플레이어')}
          </span>
        </div>
      </section>
      <MyPosts locale={locale} userId={session.user.id} />
      <GameAccountsSection userId={session.user.id} />
      <BlockedUsersSection userId={session.user.id} />
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
        <button className="settings-action danger-text" onClick={handleOpenAccountDeletion}>
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
