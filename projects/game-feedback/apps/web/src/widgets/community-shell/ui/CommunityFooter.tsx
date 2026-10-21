'use client';

import { useI18n } from '@/shared/i18n';
import { dateKey } from '@/shared/lib/date';
import { TabLink } from '@/shared/navigation';

export function CommunityFooter({ home }: { home: string }) {
  const { t } = useI18n();
  const year = dateKey(new Date().toISOString()).slice(0, 4);
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav className="site-footer-links" aria-label={t('서비스 안내')}>
          <TabLink href={`${home}/terms`}>{t('서비스 이용약관')}</TabLink>
          <TabLink href={`${home}/privacy`}>{t('개인정보 처리방침')}</TabLink>
          <TabLink href={`${home}/contact`}>{t('문의')}</TabLink>
        </nav>
        <span className="site-footer-copyright">© {year} Game Mate</span>
      </div>
    </footer>
  );
}
