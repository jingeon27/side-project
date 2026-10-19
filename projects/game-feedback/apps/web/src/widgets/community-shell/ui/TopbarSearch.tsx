'use client';
import { Search } from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';

export function TopbarSearch({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <TabLink href={href} className="icon-button" aria-label={t('검색')}>
      <Search size={21} aria-hidden="true" />
    </TabLink>
  );
}
