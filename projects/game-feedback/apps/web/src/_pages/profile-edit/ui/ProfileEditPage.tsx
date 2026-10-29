'use client';

import { useRouter } from 'next/navigation';

import { useSuspenseQuery } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { ProfileEditForm, profileOptions } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary } from '@/shared/ui';
import { CommunityPage, Topbar } from '@/widgets/community-shell';

function ProfileEditor({ userId, locale }: { userId: string; locale: string }) {
  const { data: profile } = useSuspenseQuery(profileOptions(userId));
  const router = useRouter();
  return (
    <ProfileEditForm
      profile={profile}
      onSaved={() => {
        router.push(appRoutes.profile(locale, userId));
        router.refresh();
      }}
    />
  );
}

export function ProfileEditPage({ locale }: { locale: string }) {
  const { t } = useI18n();
  const { session, login } = useSession();
  const userId = session.user?.id;
  return (
    <CommunityPage
      locale={locale}
      topbar={
        <Topbar.Root className="profile-topbar">
          <Topbar.Back
            href={userId ? appRoutes.profile(locale, userId) : appRoutes.settings(locale)}
            logicalParent={userId ? appRoutes.profile(locale, userId) : appRoutes.settings(locale)}
          />
          <Topbar.Title>{t('프로필 수정')}</Topbar.Title>
        </Topbar.Root>
      }
    >
      {userId ? (
        <AsyncBoundary clientOnly title={t('프로필 수정')} resetKey={userId}>
          <ProfileEditor key={userId} userId={userId} locale={locale} />
        </AsyncBoundary>
      ) : (
        <div className="empty-feed">
          <p>{t('로그인하고 게임 프로필과 계정을 관리하세요.')}</p>
          <Button type="button" onClick={login}>
            {t('로그인 / 시작하기')}
          </Button>
        </div>
      )}
    </CommunityPage>
  );
}
