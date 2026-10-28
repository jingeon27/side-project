'use client';

import Link from 'next/link';

import { appRoutes } from '@game-feedback/bridge';

import { useI18n } from '@/shared/i18n';

export function LoginLegalLinks() {
  const { t, locale } = useI18n();
  return (
    <nav className="login-legal-links" aria-label={t('서비스 이용 안내')}>
      <Link href={appRoutes.terms(locale)}>{t('이용약관')}</Link>
      <Link href={appRoutes.privacy(locale)}>{t('개인정보 처리 안내')}</Link>
    </nav>
  );
}
