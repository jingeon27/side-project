'use client';

import Link from 'next/link';

import { useI18n } from '@/shared/i18n';

export function LoginLegalLinks() {
  const { t, locale } = useI18n();
  return (
    <nav className="login-legal-links" aria-label={t('서비스 이용 안내')}>
      <Link href={`/${locale}/terms`}>{t('이용약관')}</Link>
      <Link href={`/${locale}/privacy`}>{t('개인정보 처리 안내')}</Link>
    </nav>
  );
}
