'use client';

import { ArrowUpRight } from 'lucide-react';

import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';
import { Avatar } from '@/shared/ui';

export function TopbarAccount({ href }: { href: string }) {
  const { t } = useI18n();
  const { session, login: handleLogin } = useSession();
  return (
    <div className="header-account">
      {session.user ? (
        <TabLink href={href} className="user-button" aria-label={t('프로필')}>
          <Avatar src={session.user.avatarUrl} name={session.user.nickname} size="small" />
          <span>{session.user.nickname}</span>
        </TabLink>
      ) : (
        <Button
          variant="primary"
          size="sm"
          type="button"
          className="button dark small-button"
          onClick={handleLogin}
          aria-label={t('로그인 / 시작하기')}
        >
          <span className="header-login-long">{t('로그인 / 시작하기')}</span>
          <span className="header-login-short">{t('로그인')}</span>
          <ArrowUpRight size={14} />
        </Button>
      )}
    </div>
  );
}
