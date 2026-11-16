'use client';

import type { ReactNode } from 'react';

import { ArrowLeft } from 'lucide-react';

import { cn, iconButtonVariants } from '@side/design-system';

import { LanguageSelect, useI18n } from '@/shared/i18n';
import { BackLink } from '@/shared/navigation';

import { TopbarAccount } from './TopbarAccount';
import { TopbarActions } from './TopbarActions';
import { TopbarNotifications } from './TopbarNotifications';
import { TopbarSearch } from './TopbarSearch';

function TopbarRoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header className={cn('topbar', className)}>
      <div className="topbar-inner">{children}</div>
    </header>
  );
}
function TopbarTitle({ children, heading = false }: { children: ReactNode; heading?: boolean }) {
  const Title = heading ? 'h1' : 'p';
  return (
    <div className="topbar-title">
      <Title>{children}</Title>
    </div>
  );
}
function TopbarBack({ href, logicalParent }: { href: string; logicalParent?: string }) {
  const { t } = useI18n();
  return (
    <BackLink
      className={cn(iconButtonVariants(), 'back-link post-header-back')}
      href={href}
      logicalParent={logicalParent}
      aria-label={t('돌아가기')}
    >
      <ArrowLeft className="size-5" aria-hidden />
    </BackLink>
  );
}
function TopbarLanguage() {
  return <LanguageSelect compact />;
}
export const Topbar = {
  Root: TopbarRoot,
  Title: TopbarTitle,
  Back: TopbarBack,
  Actions: TopbarActions,
  Account: TopbarAccount,
  Notifications: TopbarNotifications,
  Search: TopbarSearch,
  Language: TopbarLanguage,
};
