'use client';
import type { ReactNode } from 'react';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { LanguageSelect, useI18n } from '@/shared/i18n';
import { BackLink, TabLink } from '@/shared/navigation';
import { TopbarActions } from './TopbarActions';
import { TopbarAccount } from './TopbarAccount';
import { TopbarNotifications } from './TopbarNotifications';
import { TopbarSearch } from './TopbarSearch';

function TopbarRoot({ children }: { children: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">{children}</div>
    </header>
  );
}
function TopbarBrand({ home }: { home: string }) {
  const { t } = useI18n();
  return (
    <TabLink href={home} className="brand" aria-label={t('플레이메이트 홈')}>
      <span className="brand-mark">
        <Gamepad2 size={24} strokeWidth={2.5} />
      </span>
      <span>{t('플레이메이트')}</span>
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
