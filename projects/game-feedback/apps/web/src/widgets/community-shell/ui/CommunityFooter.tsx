'use client';

import dayjs from 'dayjs';

import { appRoutes } from '@game-feedback/bridge';

import { getContactEmail } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { dateKey } from '@/shared/lib/date';
import { ChildLink, TabLink } from '@/shared/navigation';

export function CommunityFooter({ home }: { home: string }) {
  const { t, locale } = useI18n();
  const year = dateKey(dayjs().toISOString()).slice(0, 4);
  const contact = getContactEmail();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav className="site-footer-links" aria-label={t('서비스 안내')}>
          <ChildLink href={appRoutes.guide(locale)} prefetch>
            {t('이용 가이드')}
          </ChildLink>
          <TabLink href={`${home}/terms`}>{t('서비스 이용약관')}</TabLink>
          <TabLink href={`${home}/privacy`}>{t('개인정보 처리방침')}</TabLink>
          <TabLink href={`${home}/contact`}>{t('문의')}</TabLink>
        </nav>
        <div className="site-footer-details">
          <p className="site-footer-contact">
            <span>{t('운영 및 광고 문의')}</span>
            <a href={`mailto:${contact}`}>{contact}</a>
          </p>
          <span className="site-footer-copyright">© {year} Game Mate</span>
        </div>
      </div>
    </footer>
  );
}
