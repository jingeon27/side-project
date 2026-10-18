'use client';
import type { ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Gamepad2 } from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import { BackLink, TabLink } from '@/shared/navigation';
import { TopbarActions } from './TopbarActions';

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
function TopbarBreadcrumb({
  game,
  gameHref,
  board,
  boardHref,
}: {
  game: string;
  gameHref: string;
  board: string;
  boardHref: string;
}) {
  const { t } = useI18n();
  return (
    <nav className="post-breadcrumb" aria-label={t('게시글 경로')}>
      <TabLink href={gameHref} title={game}>
        {game}
      </TabLink>
      <ChevronRight size={14} aria-hidden="true" />
      <TabLink href={boardHref}>{board}</TabLink>
    </nav>
  );
}
export const Topbar = {
  Root: TopbarRoot,
  Brand: TopbarBrand,
  Title: TopbarTitle,
  Back: TopbarBack,
  Breadcrumb: TopbarBreadcrumb,
  Actions: TopbarActions,
};

export function PageTopbar({
  locale,
  title,
  search = false,
}: {
  locale: string;
  title: string;
  search?: boolean;
}) {
  const { t } = useI18n();
  const home = `/${locale}`;
  return (
    <Topbar.Root>
      <Topbar.Brand home={home} />
      <Topbar.Title>{t(title)}</Topbar.Title>
      <Topbar.Actions home={home} search={search} />
    </Topbar.Root>
  );
}
export function PostTopbarPlaceholder({ home }: { home: string }) {
  return (
    <Topbar.Root>
      <Topbar.Back href={home} />
      <span className="post-header-placeholder" aria-hidden="true" />
      <Topbar.Actions home={home} account={false} />
    </Topbar.Root>
  );
}
