'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';

import { ArrowLeft } from 'lucide-react';

import { cn } from '@side/design-system';

import { LanguageSelect, useI18n } from '@/shared/i18n';
import { BackLink, TabLink } from '@/shared/navigation';

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
function TopbarBrand({ home }: { home: string }) {
  const { t } = useI18n();
  return (
    <TabLink href={home} className="brand" aria-label={t('Game Mate 홈')}>
      <span className="brand-mark">
        <Image src="/icon.svg" alt="" aria-hidden width={35} height={35} unoptimized />
      </span>
      <span>{t('Game Mate')}</span>
    </TabLink>
  );
}
function TopbarTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-page-title">
      <p>{children}</p>
    </div>
  );
}
function TopbarBack({ href, logicalParent }: { href: string; logicalParent?: string }) {
  const { t } = useI18n();
  return (
    <BackLink
      className="icon-button back-link post-header-back"
      href={href}
      logicalParent={logicalParent}
      aria-label={t('돌아가기')}
    >
      <ArrowLeft size={20} />
    </BackLink>
  );
}
function TopbarLanguage() {
  return <LanguageSelect compact />;
}
export const Topbar = {
  Root: TopbarRoot,
  Brand: TopbarBrand,
  Title: TopbarTitle,
  Back: TopbarBack,
  Actions: TopbarActions,
  Account: TopbarAccount,
  Notifications: TopbarNotifications,
  Search: TopbarSearch,
  Language: TopbarLanguage,
};
